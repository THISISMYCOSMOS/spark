import test from "node:test";
import assert from "node:assert/strict";

import { AiResponsePlanComposer, buildAiResponsePlanRequest, selectApprovedResponseActions } from "../src/index.js";
import {
  InMemoryJobQueue,
  MockSmsProvider,
  NotificationService,
  OutageWorkflow,
  TestResponseLinkIssuer,
} from "../../backend/b/src/index.js";

const patient = {
  id: "patient-plan",
  name: "김비공개",
  phone: "01012345678",
  addressText: "테스트 주소 101동",
  regionCode: "99001",
  notificationContext: {
    medicalDeviceTypes: ["VENTILATOR"],
    powerDependencyLevel: "LIFE_SUSTAINING",
    mobilitySupportRequired: true,
    communicationSupport: "TEXT_PREFERRED",
    approvedPrecautionCodes: ["CONTACT_CARE_TEAM_ON_DEVICE_ALARM"],
    freeText: "AI 전송 금지 자유서술",
  },
  powerProfile: { batteryRuntimeMinutes: 120, verifiedBackupRuntimeMinutes: 30, safetyBufferMinutes: 30 },
  emergencyContacts: [],
  institutionContacts: [],
};

const outage = {
  id: "MOCK-TYPHOON-20260814-001",
  mode: "TEST",
  status: "ACTIVE",
  disasterType: "TYPHOON",
  severity: "SEVERE",
  regionCode: "99001",
  startedAt: "2026-08-14T00:10:00.000Z",
  expectedEndAt: "2026-08-14T21:00:00.000Z",
  officialGuidanceCodes: ["KEEP_DEVICE_DRY"],
};

const impactCase = {
  id: "case-plan",
  outageId: outage.id,
  patientId: patient.id,
  riskLevel: "HIGH",
  riskReason: "SAFETY_TIME_BELOW_THRESHOLD",
  response: "NEED_HELP",
  safetyTime: { remainingMinutes: 45 },
};

test("재난과 환자 상태로 승인된 대응 코드만 결정한다", () => {
  const codes = selectApprovedResponseActions({ patient, outage, impactCase }).map((item) => item.code);
  assert.ok(codes.includes("KEEP_DEVICE_DRY"));
  assert.ok(codes.includes("NEVER_USE_GENERATOR_INDOORS"));
  assert.ok(codes.includes("CHECK_BACKUP_POWER"));
  assert.ok(codes.includes("CONFIRM_EVACUATION_ASSISTANCE"));
  assert.ok(codes.includes("KEEP_TEXT_CONTACT_AVAILABLE"));
  assert.ok(codes.includes("CONTACT_REGISTERED_GUARDIAN"));
});

for (const [disasterType, requiredCode] of [
  ["TYPHOON", "KEEP_DEVICE_DRY"],
  ["EARTHQUAKE", "DROP_COVER_HOLD_ON"],
  ["COLD_WAVE", "MAINTAIN_SAFE_INDOOR_TEMPERATURE"],
  ["FIRE", "EVACUATE_FOR_FIRE"],
]) {
  test(`${disasterType} 대응방법에 재난별 필수 코드를 포함한다`, () => {
    const codes = selectApprovedResponseActions({ patient, outage: { ...outage, disasterType }, impactCase }).map((item) => item.code);
    assert.ok(codes.includes(requiredCode));
    assert.ok(codes.includes("FOLLOW_DEVICE_MANUFACTURER_INSTRUCTIONS"));
    assert.ok(codes.includes("CHECK_DEVICE_POWER"));
  });
}

test("AI 대응방법 요청에서 환자 직접식별정보와 자유서술을 제외한다", () => {
  const actions = selectApprovedResponseActions({ patient, outage, impactCase });
  const request = buildAiResponsePlanRequest({ patient, outage, impactCase, actions });
  const serialized = JSON.stringify(request);
  assert.equal(serialized.includes(patient.name), false);
  assert.equal(serialized.includes(patient.phone), false);
  assert.equal(serialized.includes(patient.addressText), false);
  assert.equal(serialized.includes(patient.notificationContext.freeText), false);
  assert.equal(request.facts.disaster.disasterType, "TYPHOON");
  assert.deepEqual(request.allowedActions, actions);
});

test("AI가 작성한 대응방법은 검토 필수 제안으로 반환한다", async () => {
  const composer = new AiResponsePlanComposer({
    client: {
      async generateResponsePlan() {
        return { text: "공식 안내를 확인하고 의료기기 전원과 보조전원을 점검한 뒤, 기기와 전원 장치를 빗물로부터 보호하세요.", model: "fake-model", requestId: "request-1" };
      },
    },
  });
  const result = await composer.compose({ patient, outage, impactCase });
  assert.equal(result.status, "PROPOSED");
  assert.equal(result.reviewRequired, true);
  assert.equal(result.narrativeSource, "AI");
  assert.equal(result.policyVersion, "DISASTER_RESPONSE_PLAN_V1");
  assert.equal(result.fallbackReason, null);
  assert.ok(result.actions.length > 0);
});

test("의료 지시를 추가한 AI 출력은 규칙 기반 문구로 대체한다", async () => {
  const composer = new AiResponsePlanComposer({
    client: { async generateResponsePlan() { return { text: "약 복용을 중단하고 이동하세요." }; } },
  });
  const result = await composer.compose({ patient, outage, impactCase });
  assert.equal(result.narrativeSource, "RULE_FALLBACK");
  assert.equal(result.fallbackReason, "AI_UNSAFE_MEDICAL_DIRECTION");
  assert.match(result.narrative, /공식 재난 알림/);
});

test("워크플로는 발송 전에 환자별 대응방법을 만들고 승인 코드를 메시지 사실에 연결한다", async () => {
  let messageInput;
  const responsePlanComposer = new AiResponsePlanComposer({
    client: { async generateResponsePlan() { return "공식 안내를 확인하고 등록된 안전 항목을 차례로 점검하세요."; } },
  });
  const workflow = new OutageWorkflow({
    notificationService: new NotificationService({ testProvider: new MockSmsProvider() }),
    responseLinkIssuer: new TestResponseLinkIssuer({ baseUrl: "https://example.test" }),
    jobQueue: new InMemoryJobQueue(),
    responsePlanComposer,
    messageComposer: {
      async compose(input) {
        messageInput = input;
        return { text: "테스트 문자", source: "TEST", policyVersion: null, model: null, requestId: null, fallbackReason: null };
      },
    },
  });
  const result = await workflow.start({ outage, patients: [patient], now: outage.startedAt });
  assert.equal(result.responsePlans.length, 1);
  assert.equal(result.responsePlans[0].reviewRequired, true);
  assert.ok(messageInput.impactCase.responsePlanActionCodes.includes("KEEP_DEVICE_DRY"));
});
