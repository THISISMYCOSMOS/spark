# 백엔드 2: 코어 엔진·시뮬레이션·문자

백엔드 1이 전달한 환자·정전·응답 스냅샷을 바탕으로 안전시간, 위험도와 다음 대응을 결정하는 인프로세스 코어 패키지다. DB와 HTTP API를 소유하지 않는다. 현재 `OutageWorkflow`는 일부 문자 발송과 인메모리 작업 큐 등록을 직접 수행하며, 모든 효과를 통합된 “작업 명세”로만 반환하는 구조는 아니다.

상세 계약은 [`docs/BACKEND_2_CONTRACT.md`](docs/BACKEND_2_CONTRACT.md)를 참고한다.

## 구조

- `src/core`: 안전시간·위험도·매칭·StatusCheck·순차 에스컬레이션·종료 결정
- `src/core/workflow.js`: 환자 상태 확인, 문자 발송, timeout 작업 등록, 보호자·복구 흐름
- `src/notifications`: 템플릿, 발송 서비스, Mock/SOLAPI 어댑터, TEST ResponseLink
- `src/jobs/queue.js`: timeout·재시도 작업을 위한 인메모리 멱등 큐
- `src/simulation/engine.js`: `TEST` 전용 가상 정전과 시간 경과
- `src/index.js`: 공개 진입점

## 상태 모델

업무 상태와 위험도는 독립적으로 관리한다. 예를 들어 `status = GUARDIAN_ACTING`, `riskLevel = CRITICAL`이 가능하다.

- 업무 상태: `PREPARE`, `WAITING_PATIENT`, `MONITORING`, `ACTION_REQUIRED`, `GUARDIAN_ACTING`, `RECOVERY_CHECK`, `CLOSED`
- 위험도: `WATCH`, `HIGH`, `CRITICAL`
- StatusCheck: `PENDING`, `RESPONDED`, `TIMED_OUT`, `CANCELLED`
- 환자 응답: `NORMAL`, `EQUIPMENT_ISSUE`, `NEED_HELP`

`NO_RESPONSE`는 환자 응답값이 아니다. 무응답은 `StatusCheck.status = TIMED_OUT`으로 표현한다.

## DEMO_ONLY 위험도 정책

현재 정책은 운영 승인값이 아니며 의료 상태를 진단하지 않는다.

| 조건 | 위험도 |
| --- | --- |
| `remainingRatio > 0.5` | `WATCH` |
| `0.2 < remainingRatio <= 0.5` | `HIGH` |
| `remainingRatio <= 0.2` | `CRITICAL` |

추가 규칙:

- 안전시간 `UNKNOWN`: 최소 `HIGH`
- 유효 자립시간 또는 남은 안전시간 0: `CRITICAL`
- `NEED_HELP` 또는 `EQUIPMENT_ISSUE`: `CRITICAL`
- StatusCheck timeout: 최소 `HIGH`
- 모든 보호자 대응 불가: `CRITICAL`
- 지역 복구 이후: 기존 `riskLevel` 유지

정책값은 `responseTimeoutSeconds = 10`, `watchRatioThreshold = 0.5`, `criticalRatioThreshold = 0.2`다. 판정 결과에는 사용한 `policyId`와 `policyVersion`을 보존한다.

## 주요 워크플로

### 최초 환자 상태 확인

1. ResponseLink를 예약한다.
2. 환자 문자를 발송한다.
3. 공급자 접수 성공 후에만 StatusCheck를 시작한다.
4. `requestedAt = providerAcceptedAt`으로 기록한다.
5. `timeoutAt = providerAcceptedAt + 10초`, `link.expiresAt = timeoutAt`으로 설정한다.
6. timeout 작업을 예약한다.

최초 문자 실패 시 `STATUS_CHECK_NOT_STARTED`를 반환하고 StatusCheck와 timeout 작업을 만들지 않는다. 문자 재시도가 성공하면 그 접수 시각부터 상태 확인에 재진입할 수 있다.

### 예고 정전

`SCHEDULED` 정전은 `start()` 호출 시 즉시 환자와 1순위 보호자에게만 준비 문자를 보낸다. 보호자가 없으면 환자에게만 발송한다. 특정 시각 예약 발송은 현재 범위가 아니다.

### 보호자 순차 에스컬레이션

보호자는 `contactOrder` 순으로 한 번에 한 명만 이동한다. 다음 보호자로 이동하려면 다음 근거 중 하나가 필요하다.

- `GuardianAction.status === "UNAVAILABLE"`
- `guardianActionTimedOut === true`

근거 없는 반복 호출, 완료된 대응, 현재 보호자가 대응 중인 상태에서는 다음 순번으로 이동하지 않는다. 마지막 보호자 이후에는 기관으로 이동한다.

### 복구 에스컬레이션

보호자 대응은 다음 근거 중 하나가 있을 때만 가능하다.

- 복구 `StatusCheck.status === TIMED_OUT`
- `homePowerRestored === false`
- `deviceOperatingNormally === false`

PENDING, 복구 완료 또는 근거 없음 상태에서는 문자를 발송하지 않는다. 지역 복구 이후와 복구 에스컬레이션 중 기존 `riskLevel`은 유지한다.

## 문자와 외부 연동 경계

문자 중복 식별자는 `impactCaseId:notificationType:recipientId:escalationRound`다. 수신자가 없으면 null 번호로 Provider를 호출하지 않는다.

- `TEST`: `MockSmsProvider`만 허용
- `LIVE`: `MockSmsProvider` 금지
- `SolapiSmsProvider`: 인증 완료 클라이언트와 검증된 발신번호를 주입받는 어댑터 경계만 제공
- 실제 SOLAPI 인증과 운영 실발송: 아직 미완료

ResponseLink는 `reserveLink()`와 `activateLink()`의 2단계 포트를 사용한다. Backend 2의 TEST 구현은 비영속 링크만 제공하며 운영 토큰 생성·저장·검증은 백엔드 1 책임이다.

## 백엔드 1 책임

- DB, ORM, 마이그레이션
- HTTP API, 인증·권한
- 환자·정전·응답·StatusCheck·GuardianAction 상태 저장
- 운영 ResponseLink 토큰 생성·저장·검증
- 실제 스케줄러 실행과 작업 영속화
- 실제 SOLAPI 인증·발신번호·운영 연동
- 웹훅과 배포

Backend 2는 입력 스냅샷을 검증하고 계산·대응 결정을 수행한다. 운영 트랜잭션과 영속화는 백엔드 1이 담당한다.

## 실행

```powershell
cd backend/b
npm test
```

외부 패키지가 없어 `npm install`은 필요하지 않다. Node.js 20 이상을 사용한다.
