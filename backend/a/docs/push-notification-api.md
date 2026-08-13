# 앱 푸시 알림 API

앱은 로그인 후 Expo push token을 Backend A에 등록한다. 재난 대응 엔진은 정전·재난이 `ACTIVE`이고 영향 대응 건이 생성된 뒤 Core 전용 발송 API를 호출한다.

중복 방지 키는 SMS와 동일한 의미의 다음 조합이다.

```text
caseId + notificationType + recipientId + escalationRound
```

## 기기 등록

```http
POST /api/v1/push/devices
Authorization: Bearer {patient-or-guardian-token}
Content-Type: application/json

{
  "token": "ExponentPushToken[...]",
  "platform": "ANDROID"
}
```

로그아웃하거나 알림 수신을 해제할 때는 등록 응답의 `id`를 사용한다.

```http
DELETE /api/v1/push/devices/{deviceId}
Authorization: Bearer {same-user-token}
```

## 재난 푸시 발송

```http
POST /api/v1/core/impact-cases/{caseId}/push-notifications
Authorization: Bearer {core-engine-token}
Idempotency-Key: disaster-push-{caseId}-patient-0
Content-Type: application/json

{
  "notification_type": "DISASTER_ALERT",
  "recipient_id": "환자 또는 연결된 보호자 UUID",
  "recipient_role": "PATIENT",
  "escalation_round": 0
}
```

- `TEST` 재난은 Mock 공급자만 사용하며 외부 요청을 보내지 않는다.
- `LIVE` 재난은 Expo Push API를 사용한다.
- 환자 또는 해당 환자와 연결된 보호자에게만 발송할 수 있다.
- 활성 기기가 없거나 재난이 `ACTIVE`가 아니면 `409 Conflict`를 반환한다.
- 같은 중복 방지 조합으로 다시 요청하면 기존 발송 기록을 반환한다.

## 재난별 기본 문구

| 재난 | 제목 | 본문 |
|---|---|---|
| 태풍 | 태풍 재난 알림 | 태풍 영향이 지속 중입니다. 외출을 자제하고 창문과 주변 시설물을 확인해 주세요. |
| 지진 | 지진 재난 알림 | 지진이 발생했습니다. 낙하물을 피해 안전한 곳으로 이동하고 여진에 대비해 주세요. |
| 한파 | 한파 재난 알림 | 한파가 지속 중입니다. 외출을 줄이고 보온과 난방기기 안전을 확인해 주세요. |
| 화재 | 화재 재난 알림 | 화재가 발생했습니다. 연기를 피해 신속히 대피하고 엘리베이터를 사용하지 마세요. |

발송 결과 조회는 Core 권한으로 `GET /api/v1/push-notifications/{deliveryId}`를 호출한다.
