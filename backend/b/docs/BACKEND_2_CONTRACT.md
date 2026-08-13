# Backend 2 Integration Contract

## 1. 책임 경계

- Backend 2: 정전 영향 환자 선별, 안전시간·위험도 계산, 알림 결정, SMS 발송 요청, 재시도 판단, 후속 명령 생성
- Backend 1: 환자·정전·대응 건·알림 결과·StatusCheck·토큰·복구 정보 영속화, 인증, 외부 HTTP API
- Backend 2는 DB를 직접 조작하지 않고 저장 성공을 가정하지 않는다.
- Backend 1이 저장 결과 또는 검증된 이벤트를 다시 전달해야 Backend 2가 다음 결정을 수행한다.
- 업무 진행 상태와 위험도는 서로 다른 필드로 저장한다.

## 2. Backend 2 입력

Backend 1은 필요한 시점의 검증된 스냅샷을 전달한다.

```js
{
  outage: {
    id, mode, status, regionCode, regionCodes,
    startedAt, scheduledStartAt, scheduledEndAt
  },
  patients: [{
    id, name, phone, regionCode,
    powerProfile: {
      batteryRuntimeMinutes,
      safetyBufferMinutes,
      verifiedBackupRuntimeMinutes
    },
    emergencyContacts: [{ id, phone, contactOrder }],
    institutionContacts: [{ id, phone }]
  }],
  existingCases,
  now
}
```

Backend 1은 전화번호, 연락 순서, 장비 정보의 최신성과 접근 권한을 검증한 뒤 전달한다.

## 3. Backend 2 출력

워크플로 호출은 계산된 `impactCases`, 생성 대상 `statusChecks`, 알림 실패 목록과 후속 명령을 반환한다. Backend 1은 반환값을 트랜잭션 경계 안에서 저장한 후 저장 결과를 확정해야 한다.

진행 상태:

- `PREPARE`
- `WAITING_PATIENT`
- `MONITORING`
- `ACTION_REQUIRED`
- `GUARDIAN_ACTING`
- `RECOVERY_CHECK`
- `CLOSED`

위험도:

- `WATCH`
- `HIGH`
- `CRITICAL`

두 값을 하나의 enum이나 DB 컬럼으로 합치지 않는다.

환자 응답은 `NORMAL`, `EQUIPMENT_ISSUE`, `NEED_HELP`만 허용한다. 무응답은 환자 응답이 아니라 `StatusCheck.status = TIMED_OUT`이다.

## 4. Backend 1 영속화 항목

- ImpactCase 스냅샷과 정책 ID·버전
- 안전시간과 위험도 판정 근거
- Notification delivery와 각 발송 attempt
- `providerMessageId`, `providerAcceptedAt`, `errorCode`, `retryable`
- Response token reservation과 활성화 결과
- StatusCheck 및 timeout job 명령
- 보호자 상태 변경과 그 근거 이벤트
- 복구 확인 스냅샷

Backend 2의 메모리 저장소와 테스트 토큰 발급기는 TEST 전용이며 운영 저장소가 아니다.

## 5. 문자 발송 결과

```json
{
  "status": "ACCEPTED | FAILED",
  "provider": "SOLAPI",
  "providerMessageId": "string | null",
  "errorCode": "string | null",
  "retryable": false,
  "acceptedAt": "ISO-8601 | null"
}
```

`ACCEPTED`는 SOLAPI가 발송 요청을 접수했다는 뜻이며 단말 수신 완료를 의미하지 않는다. 실제 수신 결과가 필요하면 Backend 1이 SOLAPI 조회 또는 검증된 웹훅 이벤트를 저장해 별도로 전달한다.

## 6. ResponseTokenPort

Backend 1은 다음 2단계 포트를 구현한다.

```js
reserveLink({ impactCaseId, purpose, now, idempotencyKey })
// => { ok: true, data: { reservationId, url, reservedAt } }

activateLink({ reservationId, activatedAt, expiresAt })
// => { ok: true, data: { reservationId, url, activatedAt, expiresAt } }
```

실패 형식:

```json
{
  "ok": false,
  "errorCode": "TOKEN_RESERVATION_FAILED",
  "retryable": true
}
```

- 예약은 `idempotencyKey` 기준으로 멱등이어야 한다.
- 예약 상태의 토큰은 응답 처리에 사용할 수 없어야 한다.
- SOLAPI가 문자를 수락한 뒤에만 토큰을 활성화한다.
- 토큰 생성·저장·검증·소비는 Backend 1 책임이다.

## 7. StatusCheck 생성 조건

다음 조건을 모두 만족해야 생성한다.

1. 응답 링크 예약 성공
2. 문자 결과가 `ACCEPTED`
3. `providerAcceptedAt` 존재
4. 응답 링크 활성화 성공

`requestedAt`은 `providerAcceptedAt`과 같아야 한다. 발송 실패 또는 토큰 활성화 실패 시 StatusCheck를 생성하지 않는다.

## 8. Timeout job 등록 조건

- StatusCheck가 성공적으로 생성된 경우에만 등록한다.
- `timeoutAt = providerAcceptedAt + responseTimeoutSeconds`
- job idempotency key는 StatusCheck 식별자를 포함해야 한다.
- 발송 실패 시 timeout, 무응답 판정, 보호자 승격을 시작하지 않는다.

## 9. 보호자 승격 증거

Backend 1은 다음 중 검증된 이벤트를 전달한다.

- 환자 StatusCheck가 기한 후 `TIMED_OUT`으로 저장됨
- 환자 응답이 `EQUIPMENT_ISSUE` 또는 `NEED_HELP`로 저장됨
- 현재 보호자가 대응 불가 상태로 저장됨

Backend 2는 전달받은 `escalationRound`와 연락 순서 스냅샷으로 다음 한 명만 선택한다. 보호자 알림 발송 실패 시 라운드를 증가시키지 않는다.

## 10. 복구 재확인 증거

- 정전 복구 보고 이벤트
- 환자 복구 StatusCheck의 응답 또는 timeout
- 가구 전력 정상 여부
- 의료기기 정상 여부
- 보호자 복구 확인 상태

ImpactCase 종료는 가구 전력과 의료기기가 모두 정상으로 확인된 경우에만 가능하다. 복구 흐름은 기존 위험도를 덮어쓰지 않는다.

## 11. 멱등성과 중복 방지

알림 키는 Backend 2가 다음 형식으로 계산한다.

```text
impactCaseId:templateType:recipientId:escalationRound
```

호출자가 임의의 dedupe key를 전달해 우회할 수 없다. Backend 1의 알림 결과 저장과 토큰 예약도 같은 키를 unique/idempotency 기준으로 사용한다.

## 12. TEST/LIVE 분리

- TEST는 `MockSmsProvider`만 사용하며 SOLAPI를 호출하지 않는다.
- LIVE는 Mock provider를 사용할 수 없다.
- 재시도 시에도 원래 delivery의 mode로 provider를 다시 검증한다.
- TEST 데이터와 LIVE 데이터는 저장·조회·job 실행 범위에서 섞이지 않아야 한다.
- 테스트에서는 실제 문자 발송을 금지한다.

## 13. 오류 및 재시도 규칙

| errorCode | retryable | 의미 |
| --- | ---: | --- |
| `SOLAPI_CONFIG_MISSING` | false | 환경설정 누락, 시작/생성 단계 실패 |
| `SOLAPI_AUTHENTICATION_FAILED` | false | API 인증 실패 |
| `SOLAPI_INVALID_RECIPIENT` | false | 수신번호 오류 |
| `SOLAPI_INVALID_REQUEST` | false | 요청 형식 또는 발신번호 오류 |
| `SOLAPI_NETWORK_ERROR` | true | 네트워크 연결 실패 |
| `SOLAPI_RATE_LIMITED` | true | 호출 제한 |
| `SOLAPI_PROVIDER_UNAVAILABLE` | true | 공급자/서버 일시 오류 |
| `SOLAPI_PROVIDER_REJECTED` | false | 공급자가 요청을 거절함 |
| `SOLAPI_INVALID_RESPONSE` | false | 수락 여부를 확인할 수 없는 응답 |
| `SOLAPI_UNEXPECTED_ERROR` | false | 분류되지 않은 오류, fail-closed |

재시도는 `retryable=true`이고 `maxAttempts` 미만인 경우에만 수행한다. 재시도 성공 후에도 Backend 1은 수락 결과를 저장하고 토큰 활성화와 StatusCheck 생성 조건을 다시 충족시켜야 한다.

## 14. 보안

- API Key, API Secret, 토큰, 전화번호, 환자정보를 로그에 남기지 않는다.
- `.env`를 Git에 커밋하지 않는다.
- Backend 1은 알림 결과를 외부에 반환할 때 개인정보 필드를 마스킹한다.
- SOLAPI provider의 존재와 실제 문자 발송 성공 검증은 구분해 보고한다.

## 15. AI 문구 작성

AI는 알림 표현만 작성하며 위험도, 발송 대상, 타이머 또는 보호자 승격을 결정하지 않는다. Backend A의 가입정보는 `AI_MESSAGE_CONTRACT.md`의 승인된 코드 스냅샷으로 매핑한다. AI 출력이 안전 검증을 통과하지 못하면 기존 템플릿을 사용한다.
