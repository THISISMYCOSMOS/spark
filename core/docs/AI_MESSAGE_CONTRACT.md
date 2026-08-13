# AI Notification Message Contract

## 목적

환자 가입 시 수집한 상태와 재난 상황을 이용해 읽기 쉬운 알림 문구를 작성하되, AI가 의료 판단이나 발송 결정을 수행하지 않도록 제한한다.

AI는 다음을 결정하지 않는다.

- 환자 위험도
- 알림 대상과 발송 시점
- StatusCheck 또는 timeout 생성
- 약물, 산소량, 의료기기 설정 변경
- 보호자 승격과 기관 이관

위 결정은 Backend 2의 검증된 규칙 엔진이 수행한다. AI는 이미 결정된 알림의 표현만 작성한다.

## Backend A 입력 매핑

Backend A는 가입정보의 자유서술 원문을 전달하지 않고 다음 정규화 필드로 변환한다.

```js
patient.notificationContext = {
  medicalDeviceTypes: ["VENTILATOR", "OXYGEN_CONCENTRATOR"],
  powerDependencyLevel: "LIFE_SUSTAINING",
  mobilitySupportRequired: true,
  communicationSupport: "TEXT_PREFERRED",
  approvedPrecautionCodes: ["CHECK_BACKUP_POWER"]
};
```

- 코드 값은 `A-Z`, 숫자, `_`, `:`, `-`만 허용한다.
- 환자 이름, 전화번호, 주소, 보호자 정보, 진단명 자유서술은 AI 입력에서 제외한다.
- 허용되지 않은 필드와 자유서술 값은 Backend 2가 버린다.

재난 입력은 다음 검증된 필드만 사용한다.

```js
outage = {
  disasterType: "POWER_OUTAGE",
  status: "ACTIVE",
  severity: "SEVERE",
  regionCode: "11260",
  startedAt: "ISO-8601",
  expectedEndAt: "ISO-8601 | null",
  officialGuidanceCodes: ["CHECK_DEVICE_POWER"]
};
```

## AI client port

Backend 1 또는 조립 계층은 공급자별 SDK를 다음 포트 뒤에 둔다.

```js
generateMessage({ systemInstruction, facts, requiredPlaceholders })
// => { text, model?, requestId? }
```

현재 Backend 2는 OpenAI, Gemini 등 특정 공급자 SDK에 종속되지 않는다.

## 개인정보 분리

AI에는 실제 이름과 응답 URL을 보내지 않는다. AI는 다음 placeholder를 포함한 문구만 반환한다.

- `{{PATIENT_NAME}}`
- 응답이 필요한 알림의 `{{RESPONSE_URL}}`
- 예정 정전 알림의 `{{STARTS_AT}}`

출력 검증이 끝난 뒤 Backend 2 로컬 코드가 실제 이름과 URL을 삽입한다.

## 출력 거부 조건

다음 출력은 사용하지 않고 기존 템플릿으로 fallback한다.

- 필수 placeholder 누락
- 임의 URL 또는 긴 전화번호 포함
- 입력에 없는 시간·수치 생성
- 약물·산소량·의료기기 설정 변경 지시
- 진단·처방 또는 안전 보장 표현
- 2,000 UTF-8 byte 초과
- AI 오류 또는 빈 응답

## 저장할 감사 필드

- `contentSource`: `AI`, `TEMPLATE`, `TEMPLATE_FALLBACK`
- `contentPolicyVersion`: 현재 `AI_MESSAGE_V1`
- `contentModel`: 공급자가 반환한 모델 식별자
- `contentRequestId`: 공급자가 반환한 요청 식별자
- `contentFallbackReason`: fallback 사유

Prompt 원문, AI 입력 전체, 전화번호, 응답 토큰은 감사 로그에 저장하지 않는다.

## 운영 전 남은 연결

1. Backend A 가입 필드를 위 코드로 매핑
2. 사용할 AI 공급자와 모델 승인
3. 공급자별 `generateMessage` 어댑터 구현
4. 개인정보 처리 근거와 공급자 전송 범위 승인
5. 의료·운영 담당자가 허용 코드와 문구 정책 승인
6. 실패 시 템플릿 fallback을 포함한 통합 테스트
