# 프론트엔드 API 연동 가이드

의료기기 사용 가구 정전 대응 서비스의 프론트엔드 연동 문서입니다.

- API 버전: `v1`
- 로컬 API 주소: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`
- 시간 형식: UTC 기반 ISO 8601
- ID 형식: UUID 문자열

## 1. 환경설정

Vite 기준:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

백엔드 `.env`의 `CORS_ORIGINS`에도 프론트 주소가 등록되어야 합니다.

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## 2. 공통 응답 형식

성공:

```json
{
  "data": {},
  "meta": {
    "timestamp": "2026-08-14T00:00:00Z"
  },
  "error": null
}
```

실패:

```json
{
  "data": null,
  "meta": {
    "timestamp": "2026-08-14T00:00:00Z"
  },
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청값이 올바르지 않습니다.",
    "details": []
  }
}
```

프론트는 HTTP 상태와 함께 `error.code`를 기준으로 분기합니다.

## 3. 인증

인증이 필요한 요청에는 다음 헤더를 전달합니다.

```http
Authorization: Bearer {accessToken}
```

### 보호자 회원가입

```http
POST /api/v1/auth/guardians/signup
Content-Type: application/json
```

```json
{
  "guardian_name": "김보호",
  "guardian_phone": "010-1234-5678",
  "password": "safe-password",
  "patient_name": "이환자",
  "patient_phone": "010-9876-5432",
  "secondary_phone": "02-123-4567",
  "affiliated_institution": "행복복지관",
  "patient_address": "서울특별시 중구 세종대로 1",
  "diagnosis": "호흡기 질환",
  "electronic_devices": ["가정용 인공호흡기", "산소발생기"]
}
```

주요 응답:

```json
{
  "role": "GUARDIAN",
  "token": {
    "accessToken": "JWT",
    "tokenType": "Bearer",
    "expiresIn": 604800
  },
  "guardian": {},
  "patients": [],
  "guardianCode": "환자 로그인 코드"
}
```

`guardianCode`는 환자에게 전달할 코드이므로 가입 완료 화면에서 복사할 수 있게 표시합니다.

### 보호자 로그인

```http
POST /api/v1/auth/guardians/login
```

```json
{
  "phone": "010-1234-5678",
  "password": "safe-password"
}
```

### 환자 로그인

```http
POST /api/v1/auth/patients/login
```

```json
{
  "guardian_code": "보호자에게 받은 코드"
}
```

### 로그인 복원

```http
GET /api/v1/auth/me
Authorization: Bearer {accessToken}
```

앱 시작 시 저장된 토큰이 있으면 이 API를 호출합니다.

- 성공: 반환된 `role`에 맞는 화면으로 이동
- `401`: 토큰 제거 후 역할 선택 또는 로그인 화면으로 이동

### 역할

| 역할 | 사용 주체 |
|---|---|
| `GUARDIAN` | 일반 보호자 앱 |
| `PATIENT` | 일반 환자 앱 |
| `INSTITUTION_ADMIN` | 기관 관리자 화면 |
| `CORE_ENGINE` | 백엔드 2 서버 간 호출 전용 |

`INSTITUTION_ADMIN`, `CORE_ENGINE` 토큰을 일반 사용자 프론트에 포함하면 안 됩니다.

## 4. 화면별 API 매핑

| 화면/기능 | Method | API | 인증 |
|---|---:|---|---|
| 보호자 회원가입 | POST | `/api/v1/auth/guardians/signup` | 없음 |
| 보호자 로그인 | POST | `/api/v1/auth/guardians/login` | 없음 |
| 환자 코드 로그인 | POST | `/api/v1/auth/patients/login` | 없음 |
| 로그인 복원 | GET | `/api/v1/auth/me` | 환자/보호자 |
| 환자 등록 | POST | `/api/v1/patients` | 보호자 |
| 환자 상세 조회 | GET | `/api/v1/patients/{patientId}` | 본인 환자/연결 보호자 |
| 환자 수정 | PUT | `/api/v1/patients/{patientId}` | 연결 보호자 |
| 문자 상태 응답 | POST | `/api/v1/public/check-ins/{token}/responses` | 없음 |
| 보호자 행동 등록 | POST | `/api/v1/impact-cases/{caseId}/guardian-actions` | 보호자/기관 관리자 |
| 보호자 복구 확인 | POST | `/api/v1/impact-cases/{caseId}/recovery-confirmations` | 보호자/기관 관리자 |

정전 관리 API와 코어 엔진 API는 별도의 기관 관리자 프론트 또는 서버 간 연동에서 사용합니다.

## 5. 환자 등록·수정

### 환자 등록

```http
POST /api/v1/patients
Authorization: Bearer {guardianAccessToken}
Content-Type: application/json
```

```json
{
  "name": "이환자",
  "phone": "010-9876-5432",
  "secondary_phone": "02-123-4567",
  "affiliated_institution": "행복복지관",
  "address": "서울특별시 중구 세종대로 1",
  "address_detail": "101동 101호",
  "region_code": "11140",
  "diagnosis": "호흡기 질환",
  "power_profile": {
    "safety_margin_minutes": 30,
    "backup_power_runtime_minutes": 60,
    "backup_power_verified": true,
    "devices": [
      {
        "device_type": "가정용 인공호흡기",
        "model_name": "VENT-1",
        "battery_runtime_minutes": 180,
        "runtime_verified": true,
        "is_essential": true
      }
    ]
  },
  "emergency_contacts": [
    {
      "name": "김보호",
      "phone": "010-1234-5678",
      "relationship": "자녀",
      "priority": 1
    }
  ],
  "change_reason": "정전 취약 환자 신규 등록"
}
```

### 환자 수정

```http
PUT /api/v1/patients/{patientId}
Authorization: Bearer {guardianAccessToken}
```

등록 Body와 같은 전체 환자 정보를 보내며 다음 두 필드를 추가합니다.

```json
{
  "version": 1,
  "change_reason": "주소 및 배터리 정보 수정"
}
```

수정 화면 진입 시 환자를 다시 조회하고 최신 `version`을 사용해야 합니다. `409 OPTIMISTIC_LOCK_CONFLICT`가 반환되면 최신 데이터를 다시 조회한 후 사용자에게 재수정을 안내합니다.

## 6. 문자 응답 화면

문자의 프론트 URL 예시:

```text
https://frontend.example.com/check-in/{token}
```

프론트는 URL에서 토큰을 읽어 다음 공개 API를 호출합니다.

### 정전 상태 응답

```http
POST /api/v1/public/check-ins/{token}/responses
```

정상:

```json
{
  "response_type": "OK",
  "note": null
}
```

도움 요청:

```json
{
  "response_type": "NEED_HELP",
  "note": "보조 배터리를 연결할 수 없습니다."
}
```

기기 이상:

```json
{
  "response_type": "EQUIPMENT_ISSUE",
  "note": "인공호흡기 경고음이 발생합니다."
}
```

### 복구 확인 응답

```json
{
  "home_power_restored": true,
  "device_operating_normally": true,
  "note": "전력과 기기 작동을 확인했습니다."
}
```

공개 응답 화면에는 이름, 전화번호, 주소, 병명 등 환자 개인정보를 표시하지 않습니다.

토큰 오류 처리:

| 오류 | 화면 처리 |
|---|---|
| `CHECK_IN_TOKEN_INVALID` | 유효하지 않은 링크 안내 |
| `CHECK_IN_TOKEN_ALREADY_USED` | 이미 응답 완료된 링크 안내 |
| `CHECK_IN_TOKEN_EXPIRED` | 응답 기간 만료 안내 및 기관 연락 안내 |

## 7. Idempotency-Key

정전·대응·복구처럼 상태를 변경하는 API는 `Idempotency-Key`가 필요합니다.

```http
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

브라우저 예시:

```javascript
const idempotencyKey = crypto.randomUUID();
```

- 하나의 사용자 동작마다 새 키 생성
- 네트워크 오류로 동일 요청을 재시도할 때는 기존 키 재사용
- 새로운 사용자 동작에는 새 키 사용
- 같은 키로 다른 Body를 보내면 `409 IDEMPOTENCY_KEY_REUSED`

환자 등록·수정과 현재 인증 API에는 아직 `Idempotency-Key`가 필수가 아닙니다. Swagger에서 Header 항목이 표시되는 API에 전달합니다.

## 8. Enum과 화면 문구

### 사용자 역할

```text
GUARDIAN, PATIENT
```

### 정전 상태

| 값 | 권장 문구 |
|---|---|
| `SCHEDULED` | 정전 예정 |
| `ACTIVE` | 정전 진행 중 |
| `RECOVERY_REPORTED` | 지역 복구 확인 중 |
| `CLOSED` | 대응 종료 |
| `CANCELLED` | 정전 취소 |

### 환자 대응 상태

| 값 | 권장 문구 |
|---|---|
| `PREPARE` | 정전 대비 중 |
| `WAITING_PATIENT` | 환자 응답 대기 |
| `MONITORING` | 상태 관찰 중 |
| `ACTION_REQUIRED` | 대응 필요 |
| `GUARDIAN_ACTING` | 보호자 대응 중 |
| `RECOVERY_CHECK` | 가정 복구 확인 중 |
| `CLOSED` | 대응 완료 |

### 위험도

| 값 | 권장 문구 |
|---|---|
| `WATCH` | 관찰 |
| `HIGH` | 위험 |
| `CRITICAL` | 긴급 |

`PREPARE`, `RECOVERY_CHECK`는 위험도가 아니라 업무 상태입니다.

### 환자 응답

```text
OK, NEED_HELP, EQUIPMENT_ISSUE
```

### 보호자 행동

```text
CONTACTED, ACTING, UNAVAILABLE, COMPLETED
```

Enum 원문은 API 값과 로직 비교에 사용하고 화면에서는 별도의 한글 라벨로 변환합니다.

## 9. 주요 오류 처리

| HTTP/오류 코드 | 프론트 처리 |
|---|---|
| `401 AUTHENTICATION_REQUIRED` | 로그인 화면 이동 |
| `401 INVALID_ACCESS_TOKEN` | 토큰 제거 후 재로그인 |
| `401 INVALID_CREDENTIALS` | 전화번호·비밀번호 오류 표시 |
| `401 INVALID_GUARDIAN_CODE` | 보호자 코드 오류 표시 |
| `403 ROLE_REQUIRED` | 접근 권한 없음 표시 |
| `403 PATIENT_ACCESS_DENIED` | 환자 접근 권한 없음 표시 |
| `404 PATIENT_NOT_FOUND` | 환자 정보 없음 표시 |
| `409 INVALID_STATE_TRANSITION` | 최신 상태를 다시 조회하고 안내 |
| `409 OPTIMISTIC_LOCK_CONFLICT` | 최신 데이터를 다시 조회한 후 재시도 |
| `409 IDEMPOTENCY_KEY_REUSED` | 새 동작이면 새로운 키로 요청 |
| `410 CHECK_IN_TOKEN_ALREADY_USED` | 응답 완료 화면 표시 |
| `410 CHECK_IN_TOKEN_EXPIRED` | 만료 화면 표시 |
| `422 VALIDATION_ERROR` | `details`를 이용해 입력 오류 표시 |

예상하지 못한 `5xx` 오류는 사용자에게 잠시 후 다시 시도하도록 안내하고 요청 정보를 로깅합니다.

## 10. API 클라이언트 예시

```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiRequest(path, options = {}) {
  const token = getStoredAccessToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json();

  if (response.status === 401) {
    clearStoredAccessToken();
  }
  if (!response.ok) {
    throw new ApiError(response.status, payload.error);
  }
  return payload.data;
}
```

요청 필드는 현재 `snake_case`, 응답 필드는 주로 `camelCase`입니다. TypeScript 타입은 `/openapi.json`을 이용해 자동 생성하거나 Swagger 스키마를 기준으로 작성합니다.

## 11. 연동 전 체크리스트

- [ ] 프론트 API Base URL 설정
- [ ] 백엔드 `CORS_ORIGINS`에 프론트 주소 등록
- [ ] 로그인 토큰 저장·복원·삭제 처리
- [ ] 모든 인증 요청에 Bearer 토큰 적용
- [ ] 변경 API에 `Idempotency-Key` 적용
- [ ] 환자 수정 시 최신 `version` 전달
- [ ] Enum을 한글 화면 문구로 변환
- [ ] `401`, `409`, `410`, `422` 화면 처리
- [ ] 공개 응답 화면에서 개인정보 미노출
- [ ] 운영 환경에서 HTTPS 사용

