# 백엔드 2: 코어 엔진·시뮬레이션·문자

백엔드 1이 전달한 환자·정전·응답 스냅샷을 바탕으로 안전시간, 위험도와 다음 대응을 결정하는 인프로세스 코어 패키지다. DB와 HTTP API를 소유하지 않는다. 현재 `OutageWorkflow`는 일부 문자 발송과 인메모리 작업 큐 등록을 직접 수행하며, 모든 효과를 통합된 “작업 명세”로만 반환하는 구조는 아니다.

상세 계약은 [`docs/BACKEND_2_CONTRACT.md`](docs/BACKEND_2_CONTRACT.md)를 참고한다.

- `src/core/safety-time.js`: 등록 자립시간, 검증된 보조전원, 안전 버퍼, 정전 경과시간 계산. 누락·오류 입력은 `UNKNOWN`.
- `src/core/risk.js`: `PREPARE`, `WATCH`, `HIGH`, `CRITICAL`, `RECOVERY_CHECK` 규칙 엔진.
- `src/core/matching.js`: 지역코드 우선 환자 매칭, 주소 접두어 보조 매칭, `(outageId, patientId)` 중복 방지.
- `src/core/workflow.js`: 상태 확인 → 시간 경과 위험 상승/무응답 보호자 알림 → 복구 재확인 자동 흐름.
- `src/simulation/engine.js`: `TEST` 전용 가상 정전, 시간 경과, 복구 신호, 재계산.
- `src/notifications`: Mock/SOLAPI 어댑터, 기관별 템플릿, 발송 결과·재시도·중복 방지, 일회성 응답 토큰.
- `src/jobs/queue.js`: 응답 시간 초과, 문자 재시도, 복구 재확인을 위한 멱등 작업 큐.

## 실행

```powershell
cd backend/b
npm install
npm test
```

Node.js 20.16 이상을 사용한다.

## 백엔드 1 연결 계약

`src/index.js`가 공개 진입점이다. 백엔드 1은 환자·정전 데이터를 엔진 입력 형태로 매핑하고, 반환된 `ImpactCase`, `NotificationDelivery`, 작업을 하나의 DB 트랜잭션 또는 멱등 저장 로직으로 기록해야 한다. DB에도 `(outage_id, patient_id)`와 문자 `deduplication_key` 고유 제약을 두어 동시 요청 중복을 최종 차단해야 한다.

`SolapiSmsProvider`에는 인증이 완료된 SOLAPI 클라이언트와 검증된 발신번호를 주입한다. `TEST` 모드는 반드시 `MockSmsProvider`, `LIVE` 모드는 Mock이 아닌 공급자만 허용한다. 이 저장소에는 키·발신번호를 저장하지 않는다.

AI 문구·대응방법과 재난 PDF 판독은 root `core`가 소유한다. 백엔드 2는 core에서 주입한 문구 작성 포트를 사용하고 SOLAPI 발송과 접수 결과 정규화만 담당한다.

## 정책 경계

`DEMO_ONLY_RISK_POLICY`의 `HIGH` 기준 60분, 응답 제한 30분, 재확인 30분은 제품·의료 담당자의 확정값이 아니다. 승인된 설정으로 교체하기 전에는 운영 판단에 사용하면 안 된다. 이 엔진은 등록된 전원 정보 기반 추정만 하며 의료 상태를 진단하지 않는다.

현재 범위에 실제 DB, HTTP 라우트, SOLAPI 계정/인증, 운영 스케줄러는 포함하지 않는다. 이는 백엔드 1 및 배포 환경에서 어댑터로 연결한다.
