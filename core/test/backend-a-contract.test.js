import test from "node:test";
import assert from "node:assert/strict";

import { BackendAHttpClient, BackendAResponseTokenPort } from "../src/index.js";

function ok(data) {
  return { ok: true, status: 200, async json() { return { data, error: null }; } };
}

test("ImpactCase 생성 요청에 Backend A 필수 ID와 실제 상태를 보낸다", async () => {
  let request;
  const client = new BackendAHttpClient({
    baseUrl: "https://backend-a.test",
    coreToken: "core-token",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return ok({ id: "case-id" });
    },
  });
  await client.createImpactCase("outage-id", {
    id: "11111111-1111-4111-8111-111111111111",
    patientId: "22222222-2222-4222-8222-222222222222",
    status: "WAITING_PATIENT",
    riskLevel: "HIGH",
    safetyTime: { status: "UNKNOWN", reason: "RUNTIME_MISSING" },
    updatedAt: "2026-08-14T00:00:00.000Z",
    riskReason: "환자 응답 대기",
  });

  const body = JSON.parse(request.options.body);
  assert.equal(body.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.status, "WAITING_PATIENT");
});

test("상태 확인 ID를 전달하고 공급자 접수 시각부터 응답 타이머를 시작한다", async () => {
  let registered;
  const port = new BackendAResponseTokenPort({
    backendAClient: {
      async registerStatusCheck(input) {
        registered = input;
        return { id: input.id };
      },
    },
    responseBaseUrl: "https://frontend.test/app/",
  });
  const reserved = port.reserveLink({
    impactCaseId: "case-id",
    purpose: "OUTAGE_STATUS",
    now: "2026-08-14T00:00:00.000Z",
    idempotencyKey: "check-1",
  }).data;
  assert.match(reserved.url, /^https:\/\/frontend\.test\/check-in\//);

  const result = await port.activateLink({
    reservationId: reserved.reservationId,
    activatedAt: "2026-08-14T00:00:05.000Z",
    expiresAt: "2026-08-14T00:00:15.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(registered.id, reserved.reservationId);
  assert.equal(registered.providerAcceptedAt, "2026-08-14T00:00:05.000Z");
  assert.equal(registered.responseDueAt, "2026-08-14T00:00:15.000Z");
});

test("AI 대응책 제안을 Backend A에 원본 계약으로 저장한다", async () => {
  let request;
  const client = new BackendAHttpClient({
    baseUrl: "https://backend-a.test",
    coreToken: "core-token",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return ok({ id: "case-id" });
    },
  });
  const plan = {
    impactCaseId: "case-id",
    status: "PROPOSED",
    reviewRequired: true,
    policyVersion: "DISASTER_RESPONSE_PLAN_V1",
    actions: [{ code: "CHECK_DEVICE_POWER", instructionKo: "기기 전원을 확인하세요." }],
    narrative: "기기 전원을 확인하세요.",
    narrativeSource: "RULE_FALLBACK",
    model: null,
    requestId: null,
    fallbackReason: "AI_CLIENT_ERROR",
  };

  await client.saveResponsePlan(plan);

  assert.equal(new URL(request.url).pathname, "/api/v1/impact-cases/case-id/response-plan");
  const expectedBody = { ...plan };
  delete expectedBody.impactCaseId;
  assert.deepEqual(JSON.parse(request.options.body), expectedBody);
});
