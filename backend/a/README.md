# 환자/보호자 구분형 인증 백엔드

프론트엔드 연동 방법은 [`docs/frontend-api-integration.md`](docs/frontend-api-integration.md)를 참고하십시오.

FastAPI와 SQLAlchemy로 구현한 독립 실행형 인증 API입니다. 작업 파일은 모두 `backend/a/` 내부에 있습니다.

## 1. 프로젝트 구조

```text
app/
├── auth/              # 회원가입·로그인·토큰 사용자 조회
│   ├── router.py
│   ├── schemas.py
│   ├── service.py
│   ├── repositories.py
│   └── presenters.py
├── patients/          # 환자·전원 프로필·보호자 연락 순서
│   ├── router.py
│   ├── schemas.py
│   ├── service.py
│   ├── repositories.py
│   └── presenters.py
├── outages/           # 정전·대응 건·위험 결과 저장
│   ├── router.py
│   ├── schemas.py
│   ├── service.py
│   ├── repositories.py
│   └── presenters.py
├── responses/         # 상태 확인·환자 응답·보호자 행동·복구
│   ├── router.py
│   ├── schemas.py
│   └── service.py
├── models.py          # 공통 Entity 및 DB 제약
├── database.py        # DB 연결과 세션
├── audit_repository.py
├── authorization.py   # 역할 검사
├── security.py        # 비밀번호·HMAC·JWT
├── idempotency.py
├── api_responses.py   # 공통 data/meta/error 응답
├── dependencies.py
├── config.py
├── errors.py
└── main.py            # 앱 조립과 전역 예외 처리
```

기존 `backend/a/`에는 `.gitkeep` 외 구현이 없어 충돌하는 인증 코드나 스키마는 없었습니다.

## 2. DB 스키마

- `guardians`: UUID PK, 이름, 정규화 전화번호(Unique), 비밀번호 해시, 활성 여부, 생성·수정 시각, version
- `patients`: UUID PK, 이름, 전화번호, 기관, 주소·상세주소·지역 코드, 병명, 활성 여부, 생성·수정 시각, version
- `guardian_patients`: 보호자–환자 연결, `(guardian_id, patient_id)` Unique, 연락 우선순위
- `guardian_access_codes`: 코드의 HMAC digest(Unique), 연결 보호자/환자, 활성·폐기 상태
- `power_profiles`: 환자별 1개, 안전 여유시간, 검증된 보조전원 지속시간, version
- `medical_devices`: 기기 종류·모델·배터리 지속시간·검증 여부·필수 여부
- `emergency_contacts`: 환자별 보호자 연락처와 연락 순서, 환자별 전화번호·순서 Unique
- `audit_logs`: 변경 전후 값, 처리자 ID·역할, 사유, 처리 시각
- `outage_events`: 예고·비예고 정전, TEST/LIVE, 영향 지역과 상태·시각
- `outage_event_histories`: 정전 상태의 이전/이후 값, 처리자·사유·시각
- `impact_cases`: 정전별 환자 대응 상태와 독립된 위험도·계산 근거 스냅샷
- `risk_policies`: 버전이 고정된 위험 정책 (`DEMO_ONLY_DEFAULT` 포함)
- `idempotency_records`: 변경 요청의 키·본문 해시·최초 응답

회원가입은 보호자·환자·관계·코드를 하나의 DB 트랜잭션으로 생성합니다. 보호자 전화번호와 코드 digest의 Unique 제약으로 동시 중복 생성을 차단합니다. 현재 `version`은 향후 프로필 수정 API의 낙관적 잠금에 사용할 예약 필드입니다.

## 3. 보안 결정

- 비밀번호: 임의 salt와 PBKDF2-SHA256 310,000회로 해시
- 보호자 코드: CSPRNG 숫자 6자리 코드, DB에는 pepper 기반 HMAC-SHA256만 저장
- 로그인 유지: 역할과 사용자 UUID를 담은 HS256 JWT, 기본 만료 7일
- 전화번호: 숫자만 남겨 로그인 ID를 일관되게 비교
- 로그인 실패: 계정 존재 여부가 드러나지 않는 동일 오류 메시지

가입 응답의 `guardianCode`는 환자 전달을 위해 한 번만 반환합니다. 운영 환경에서는 HTTPS 사용과 비밀값 교체가 필수입니다.

## 4. 실행

```bash
cd backend/a
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

기본 DB는 `app.db` SQLite입니다. `DATABASE_URL`로 PostgreSQL 등 SQLAlchemy 지원 DB를 지정할 수 있습니다. 운영 환경에서는 `JWT_SECRET`, `GUARDIAN_CODE_PEPPER`, `RESPONSE_TOKEN_PEPPER`를 각각 충분히 긴 무작위 비밀값으로 설정하십시오. 프론트 주소가 기본 개발 포트와 다르면 `CORS_ORIGINS`에 쉼표로 구분해 추가하십시오.

- Swagger UI: `http://127.0.0.1:8000/docs`
- 상태 확인: `GET http://127.0.0.1:8000/health`
- 테스트: `pytest -q`
- 테스트 데이터: `python -m scripts.seed_demo` (`DEMO_ONLY`, 중복 실행 안전)

기존 `create_all` 기반 개발 DB를 사용했다면 먼저 백업한 후 새 DB에서 `alembic upgrade head`를 실행하십시오. 이번 로컬 전환 전 빈 DB는 `app.pre-phase1.db`로 백업했습니다.

## 5. API 테스트 예시

### 보호자 회원가입 및 자동 로그인

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/guardians/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "guardian_name":"김보호",
    "guardian_phone":"010-1234-5678",
    "password":"safe-password",
    "patient_name":"이환자",
    "patient_phone":"010-9876-5432",
    "secondary_phone":"02-123-4567",
    "affiliated_institution":"행복복지관",
    "patient_address":"서울시 중구",
    "diagnosis":"호흡기 질환",
    "electronic_devices":["가정용 인공호흡기","산소발생기"]
  }'
```

응답의 `data.token.accessToken`은 보호자 자동 로그인 토큰이고, `data.guardianCode`는 환자 로그인 코드입니다.

### 보호자 재로그인

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/guardians/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"010-1234-5678","password":"safe-password"}'
```

### 환자 코드 로그인

```bash
curl -X POST http://127.0.0.1:8000/api/v1/auth/patients/login \
  -H 'Content-Type: application/json' \
  -d '{"guardian_code":"가입 응답에서 받은 코드"}'
```

### 로그인 사용자 및 연결 정보 조회

```bash
curl http://127.0.0.1:8000/api/v1/auth/me \
  -H 'Authorization: Bearer ACCESS_TOKEN'
```

보호자 토큰은 보호자와 연결 환자 목록을, 환자 토큰은 해당 환자 정보를 반환합니다. 모든 API는 설계 기준의 `data/meta/error` 공통 형식을 사용합니다.

### 환자 도메인 API

```text
POST /api/v1/patients              보호자가 환자 등록
GET  /api/v1/patients/{patientId}  연결 보호자 또는 본인 환자가 조회
PUT  /api/v1/patients/{patientId}  연결 보호자가 전체 정보 수정
```

등록·수정 Body에는 `region_code`, `power_profile`, `emergency_contacts`가 필요합니다. 수정 시 조회 응답의 `version`과 `change_reason`을 함께 보내며, 오래된 version은 `409 OPTIMISTIC_LOCK_CONFLICT`가 됩니다. 상세 요청 구조는 Swagger의 `PatientCreateRequest`, `PatientUpdateRequest`를 참조하십시오.

1단계는 안전시간 계산 결과나 위험도를 저장하지 않습니다. 배터리·보조전원·안전 여유시간의 원천 데이터만 관리하며 계산과 판정은 백엔드 2 코어 엔진의 소유 영역입니다.

### 정전 및 대응 건 API

```text
POST /api/v1/outages
GET  /api/v1/outages/{outageId}
PUT  /api/v1/outages/{outageId}
POST /api/v1/outages/{outageId}/activate
POST /api/v1/outages/{outageId}/cancel
POST /api/v1/outages/{outageId}/impact-cases
GET  /api/v1/outages/{outageId}/impact-cases
GET  /api/v1/impact-cases/{caseId}
POST /api/v1/impact-cases/{caseId}/transitions
POST /api/v1/impact-cases/{caseId}/risk-results
POST /api/v1/outages/{outageId}/close
```

정전 관리에는 `INSTITUTION_ADMIN`, 대응 건 생성·상태 전환·위험 결과 저장에는 `CORE_ENGINE` JWT가 필요합니다. 해당 토큰 발급은 기관 인증 계층과 백엔드 2 연동 영역이며 이 모듈은 역할을 검증합니다. 모든 변경 요청에는 8~100자의 `Idempotency-Key` 헤더가 필요합니다.

기본 시연 정책은 다음 식별자로 마이그레이션에서 생성됩니다.

```text
riskPolicyId: 00000000-0000-0000-0000-000000000001
riskPolicyVersion: 1
name: DEMO_ONLY_DEFAULT
```

업무 상태와 위험도는 서로 독립적으로 저장됩니다. `/transitions`는 업무 상태만, `/risk-results`는 위험도와 계산 근거만 변경합니다.

대응 상태 전환과 종료 가능 여부는 백엔드 2가 결정합니다. 백엔드 A의 `/transitions`와 `/close`는 `CORE_ENGINE`이 전달한 결정을 optimistic lock과 DB 무결성 검증 후 저장합니다. 이미 `CLOSED`인 대응 건이나 정전은 다시 전이하지 않습니다.
`CLOSED` 명령은 대응 건이 `RECOVERY_CHECK`, 정전이 `RECOVERY_REPORTED`인 경우에만 저장합니다. 이는 종료 가능 여부를 재계산하는 것이 아니라 명백히 잘못된 command 저장을 막는 최소 invariant입니다. Backend B가 생성한 canonical UUID는 ImpactCase와 StatusCheck 생성 요청의 `id`로 받아 A의 PK에 그대로 저장합니다.

### 응답·보호자 행동·복구 API

```text
POST /api/v1/impact-cases/{caseId}/status-checks
POST /api/v1/status-checks/{checkId}/timeout
POST /api/v1/public/check-ins/{token}/responses
POST /api/v1/impact-cases/{caseId}/guardian-actions
POST /api/v1/outages/{outageId}/recovery
POST /api/v1/impact-cases/{caseId}/recovery-confirmations
```

- 백엔드 2가 생성한 일회성 토큰과 SMS 공급자 접수 시각을 `status-checks`에 등록합니다.
- DB에는 토큰 원문 대신 `RESPONSE_TOKEN_PEPPER` 기반 HMAC만 저장합니다.
- canonical purpose는 `OUTAGE_STATUS`, `RECOVERY_CONFIRMATION`입니다.
- canonical 환자 응답은 `NORMAL`, `NEED_HELP`, `EQUIPMENT_ISSUE`입니다.
- legacy 입력 `OUTAGE_CHECK`, purpose의 `RECOVERY_CHECK`, 환자 응답 `OK`는 입력 계층에서만 canonical 값으로 변환하며 DB와 응답에는 canonical 값만 사용합니다.
- `requested_at = provider_accepted_at`, `token_expires_at = response_due_at`을 저장 계약으로 검증합니다.
- 무응답은 `StatusCheck.TIMED_OUT`으로만 기록하고 `PatientResponse`를 만들지 않습니다.
- 공개 URL과 응답에는 환자 상세 개인정보를 포함하지 않습니다.
- 지역 복구 API는 정전의 `RECOVERY_REPORTED` 사실만 저장합니다. 어떤 대응 건을 `RECOVERY_CHECK`로 보낼지는 백엔드 2가 결정합니다.
- 복구 응답 API는 확인 스냅샷만 저장합니다. 대응 건과 정전의 종료 가능 여부는 백엔드 2가 결정하고 CORE_ENGINE 저장 API로 반영합니다.

SMS 전송, 연락 대상 선택, 재시도, 문자 중복 방지, 타임아웃 스케줄 실행은 백엔드 2가 담당합니다. 이 모듈은 공급자 접수 이후의 확인 데이터와 결과를 저장합니다.

주소 매칭, 영향 환자 선별, 안전시간 계산, 위험도 판정은 수행하지 않습니다. 백엔드 2 코어 엔진이 계산한 결과를 명시적 API 계약으로 검증·저장합니다.

## 6. 주요 오류 코드

| HTTP | 코드 | 의미 |
|---:|---|---|
| 401 | `INVALID_CREDENTIALS` | 보호자 전화번호 또는 비밀번호 불일치 |
| 401 | `INVALID_GUARDIAN_CODE` | 코드가 없거나 폐기됨 또는 연결 계정 비활성 |
| 401 | `AUTHENTICATION_REQUIRED` | Bearer 토큰 누락 |
| 401 | `INVALID_ACCESS_TOKEN` | 토큰 위조·만료·형식 오류 |
| 401 | `ACCOUNT_INACTIVE` | 로그인 이후 계정 비활성화 |
| 409 | `PHONE_ALREADY_REGISTERED` | 이미 가입된 보호자 전화번호 |
| 409 | `SIGNUP_CONFLICT` | 동시 가입 등 DB Unique 충돌 |
| 409 | `OPTIMISTIC_LOCK_CONFLICT` | 오래된 version으로 환자 수정 |
| 403 | `PATIENT_ACCESS_DENIED` | 연결되지 않은 환자 접근 |
| 404 | `PATIENT_NOT_FOUND` | 환자가 없거나 비활성 |
| 409 | `INVALID_STATE_TRANSITION` | 허용되지 않은 상태 전환 |
| 409 | `IMPACT_CASE_ALREADY_EXISTS` | 동일 정전·환자 대응 건 존재 |
| 409 | `RISK_POLICY_VERSION_MISMATCH` | 정책 ID와 버전 불일치 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 동일 키에 다른 요청 본문 사용 |
| 422 | `VALIDATION_ERROR` | 전화번호, 비밀번호, 필수값 등 검증 실패 |
