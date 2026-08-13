import test from "node:test";
import assert from "node:assert/strict";

import {
  DeliveryStatus,
  InMemoryNotificationStore,
  MockSmsProvider,
  Mode,
  NotificationService,
  NotificationTemplateRegistry,
  NotificationType,
  TestResponseLinkIssuer,
} from "../src/index.js";

test("TEST 문자는 Mock 공급자만 사용하며 같은 이벤트 문자를 중복 발송하지 않는다", async () => {
  const provider = new MockSmsProvider();
  const service = new NotificationService({ testProvider: provider });
  const input = {
    mode: Mode.TEST,
    outageId: "outage-1",
    impactCaseId: "case-1",
    recipientType: "PATIENT",
    to: "01000000000",
    templateType: NotificationType.OUTAGE_STATUS_CHECK,
    text: "테스트 문자",
  };

  const first = await service.send(input);
  const second = await service.send(input);

  assert.equal(first.delivery.status, DeliveryStatus.SENT);
  assert.equal(second.duplicate, true);
  assert.equal(provider.messages.length, 1);
});

test("기관별 문자 템플릿을 등록하고 기본 템플릿과 분리해 렌더링한다", () => {
  const registry = new NotificationTemplateRegistry();
  registry.set({
    organizationId: "hospital-1",
    type: NotificationType.OUTAGE_STATUS_CHECK,
    renderer: ({ patientName }) => `[병원1] ${patientName}님 상태 확인`,
  });

  assert.equal(
    registry.render(NotificationType.OUTAGE_STATUS_CHECK, { patientName: "김환자" }, "hospital-1"),
    "[병원1] 김환자님 상태 확인",
  );
  assert.match(
    registry.render(NotificationType.OUTAGE_STATUS_CHECK, {
      patientName: "김환자",
      responseUrl: "https://example.test",
    }),
    /^\[정전 확인\]/,
  );
});

test("실패 결과와 재시도 횟수를 저장한다", async () => {
  const provider = new MockSmsProvider({ failRecipients: ["01011111111"] });
  const store = new InMemoryNotificationStore();
  const service = new NotificationService({ testProvider: provider, store, maxAttempts: 3 });
  const sent = await service.send({
    mode: Mode.TEST,
    outageId: "outage-1",
    impactCaseId: "case-1",
    recipientType: "GUARDIAN",
    to: "01011111111",
    templateType: NotificationType.GUARDIAN_ACTION_REQUIRED,
    text: "재시도 테스트",
  });

  assert.equal(sent.delivery.status, DeliveryStatus.FAILED);
  provider.failRecipients.delete("01011111111");
  const retried = await service.retryFailed(sent.delivery.id);
  assert.equal(retried.status, DeliveryStatus.SENT);
  assert.equal(retried.attempts.length, 2);
});

test("알림 식별자는 caseId+notificationType+recipientId+escalationRound이며 라운드가 다르면 중복이 아니다", async () => {
  const provider = new MockSmsProvider();
  const service = new NotificationService({ testProvider: provider });
  const base = {
    mode: Mode.TEST,
    outageId: "outage-1",
    impactCaseId: "case-1",
    recipientType: "GUARDIAN",
    recipientId: "guardian-1",
    to: "01022222222",
    templateType: NotificationType.GUARDIAN_ACTION_REQUIRED,
    text: "보호자 알림",
  };

  const round0 = await service.send({ ...base, escalationRound: 0 });
  const round0Again = await service.send({ ...base, escalationRound: 0 });
  const round1 = await service.send({ ...base, escalationRound: 1 });

  assert.equal(round0.duplicate, false);
  assert.equal(round0Again.duplicate, true);
  assert.equal(round1.duplicate, false);
  assert.equal(round0.delivery.deduplicationKey, "case-1:GUARDIAN_ACTION_REQUIRED:guardian-1:0");
  assert.equal(round1.delivery.deduplicationKey, "case-1:GUARDIAN_ACTION_REQUIRED:guardian-1:1");
});

test("TEST/LIVE 공급자 가드는 최초 발송뿐 아니라 재시도에도 동일하게 적용된다", async () => {
  const testProvider = new MockSmsProvider();
  const liveProvider = {
    kind: "SOLAPI",
    async send() {
      return {
        status: DeliveryStatus.FAILED,
        provider: "SOLAPI",
        providerMessageId: null,
        errorCode: "SOLAPI_NETWORK_ERROR",
        retryable: true,
        acceptedAt: null,
      };
    },
  };
  const service = new NotificationService({ testProvider, liveProvider });

  const sent = await service.send({
    mode: Mode.LIVE,
    outageId: "outage-1",
    impactCaseId: "case-2",
    recipientType: "GUARDIAN",
    to: "01033333333",
    templateType: NotificationType.CRITICAL_ALERT,
    text: "라이브 재시도 테스트",
  });
  assert.equal(sent.delivery.status, DeliveryStatus.FAILED);

  // Simulate misconfiguration after the initial send: the LIVE slot now points at a Mock provider.
  service.providers[Mode.LIVE] = new MockSmsProvider();
  await assert.rejects(() => service.retryFailed(sent.delivery.id), /LIVE_MODE_PROVIDER_VIOLATION/);
});

test("응답 링크는 만료시간이 있는 결정적 테스트 전용 링크이며 검증/저장 기능이 없다", () => {
  const issuer = new TestResponseLinkIssuer({ baseUrl: "https://example.test" });
  const first = issuer.issueLink({
    impactCaseId: "case-1",
    purpose: "OUTAGE_STATUS",
    now: "2026-08-13T10:00:00.000Z",
    expiresAt: "2026-08-13T10:00:10.000Z",
  });
  const second = issuer.issueLink({
    impactCaseId: "case-1",
    purpose: "OUTAGE_STATUS",
    now: "2026-08-13T10:00:00.000Z",
    expiresAt: "2026-08-13T10:00:10.000Z",
  });

  assert.match(first.url, /^https:\/\/example\.test\/respond\//);
  // Link expiration is the caller's exact deadline, not an independently derived minute count.
  assert.equal(first.expiresAt, "2026-08-13T10:00:10.000Z");
  assert.notEqual(first.token, second.token);
  // Backend 2 must not own production token validation/persistence (v0.1 #7).
  assert.equal(typeof issuer.consume, "undefined");
  assert.equal(typeof issuer.validate, "undefined");
});

test("issueLink은 expiresAt이 없으면 명시적으로 실패한다", () => {
  const issuer = new TestResponseLinkIssuer({ baseUrl: "https://example.test" });
  assert.throws(() => issuer.issueLink({ impactCaseId: "case-1", purpose: "OUTAGE_STATUS" }), /expiresAt is required/);
});

test("응답 토큰은 예약 후 provider 수락 시각 기준 만료시간으로 활성화한다", () => {
  const issuer = new TestResponseLinkIssuer({ baseUrl: "https://example.test" });
  const reserved = issuer.reserveLink({
    impactCaseId: "case-two-phase",
    purpose: "OUTAGE_STATUS",
    now: "2026-08-13T10:00:00.000Z",
    idempotencyKey: "case-two-phase:OUTAGE_STATUS_CHECK:patient-1:0",
  });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.data.expiresAt, null);

  const activated = issuer.activateLink({
    reservationId: reserved.data.reservationId,
    activatedAt: "2026-08-13T10:00:05.000Z",
    expiresAt: "2026-08-13T10:00:15.000Z",
  });
  assert.equal(activated.ok, true);
  assert.equal(activated.data.activatedAt, "2026-08-13T10:00:05.000Z");
  assert.equal(activated.data.expiresAt, "2026-08-13T10:00:15.000Z");

  const duplicateReservation = issuer.reserveLink({
    impactCaseId: "case-two-phase",
    purpose: "OUTAGE_STATUS",
    now: "2026-08-13T10:00:06.000Z",
    idempotencyKey: "case-two-phase:OUTAGE_STATUS_CHECK:patient-1:0",
  });
  assert.equal(duplicateReservation.data.reservationId, reserved.data.reservationId);
});

test("NotificationService.send은 caseId+type+recipientId+escalationRound 외의 커스텀 중복방지 키를 받지 않는다", async () => {
  const provider = new MockSmsProvider();
  const service = new NotificationService({ testProvider: provider });
  const base = {
    mode: Mode.TEST,
    outageId: "outage-1",
    impactCaseId: "case-1",
    recipientType: "GUARDIAN",
    recipientId: "guardian-1",
    to: "01044444444",
    templateType: NotificationType.GUARDIAN_ACTION_REQUIRED,
    text: "중복방지 테스트",
    escalationRound: 0,
  };

  // A caller-supplied deduplicationKey is silently ignored — the identity is always canonical.
  const first = await service.send({ ...base, deduplicationKey: "custom-key-a" });
  const second = await service.send({ ...base, deduplicationKey: "custom-key-b" });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.delivery.deduplicationKey, "case-1:GUARDIAN_ACTION_REQUIRED:guardian-1:0");
});
