import test from "node:test";
import assert from "node:assert/strict";

import {
  AiPatientContextInterpreter,
  GeminiAiClient,
  GeminiClientError,
  GeminiConfigurationError,
  buildAiMessageRequest,
  buildAiResponsePlanRequest,
  buildPatientInterpretationRequest,
} from "../src/index.js";

const secretApiKey = "test-secret-gemini-key";
const model = "test-gemini-model";

function fakeSdk(responses, captured) {
  return {
    models: {
      async generateContent(request) {
        captured.push(request);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
}

test("Gemini 환경변수에 해당하는 API 키와 모델명이 누락되면 초기화를 거부한다", () => {
  assert.throws(
    () => new GeminiAiClient({ apiKey: "", model }),
    (error) => error instanceof GeminiConfigurationError && error.code === "GEMINI_API_KEY_REQUIRED",
  );
  assert.throws(
    () => new GeminiAiClient({ apiKey: secretApiKey, model: "" }),
    (error) => error instanceof GeminiConfigurationError && error.code === "GEMINI_MODEL_REQUIRED",
  );
});

test("세 Gemini 메서드는 공식 SDK generateContent 요청으로 역할별 최소 사실을 매핑한다", async () => {
  const captured = [];
  const client = new GeminiAiClient({
    apiKey: secretApiKey,
    model,
    sdkClient: fakeSdk([
      {
        text: JSON.stringify({
          medicalDeviceTypes: ["VENTILATOR"],
          powerDependencyLevel: "LIFE_SUSTAINING",
          mobilitySupportRequired: null,
          communicationSupport: "UNKNOWN",
          approvedPrecautionCodes: ["CHECK_DEVICE_POWER"],
        }),
        modelVersion: "test-model-version",
        responseId: "patient-request-id",
      },
      { text: "{{PATIENT_NAME}}님, 상태를 확인해 주세요. {{RESPONSE_URL}}", responseId: "message-request-id" },
      { text: "등록된 안전 항목을 차례로 확인하세요.", responseId: "plan-request-id" },
    ], captured),
  });

  const patientRequest = buildPatientInterpretationRequest({
    name: "김비공개",
    phone: "010-1234-5678",
    addressText: "서울시 비공개로 1",
    diagnosis: "김비공개 환자 연락처 010-1234-5678, 서울시 비공개로 1. 호흡 보조 필요",
    powerProfile: {
      devices: [{ deviceType: "가정용 인공호흡기", batteryRuntimeMinutes: 120, runtimeVerified: true, isEssential: true }],
      backupPowerRuntimeMinutes: 30,
      backupPowerVerified: true,
    },
  });
  const patientResult = await client.interpretPatientContext(patientRequest);

  const messageRequest = buildAiMessageRequest({
    templateType: "OUTAGE_STATUS_CHECK",
    recipientType: "PATIENT",
    patient: {
      name: "김비공개",
      phone: "01012345678",
      addressText: "서울시 비공개로 1",
      notificationContext: { medicalDeviceTypes: ["VENTILATOR"], powerDependencyLevel: "LIFE_SUSTAINING" },
      powerProfile: { batteryRuntimeMinutes: 120 },
    },
    outage: { disasterType: "TYPHOON", status: "ACTIVE", regionCode: "99001" },
    impactCase: { riskLevel: "HIGH", riskReason: "SAFETY_TIME_UNKNOWN" },
    variables: { patientName: "김비공개", responseUrl: "https://private.test/token" },
  });
  await client.generateMessage(messageRequest);

  const responsePlanRequest = buildAiResponsePlanRequest({
    patient: { notificationContext: { medicalDeviceTypes: ["VENTILATOR"] } },
    outage: { disasterType: "TYPHOON", status: "ACTIVE", regionCode: "99001" },
    impactCase: { riskLevel: "HIGH" },
    actions: [{ code: "CHECK_DEVICE_POWER", instructionKo: "의료기기 전원을 확인하세요.", ignored: "not sent" }],
  });
  await client.generateResponsePlan(responsePlanRequest);

  assert.equal(patientResult.context.powerDependencyLevel, "LIFE_SUSTAINING");
  assert.equal(patientResult.model, "test-model-version");
  assert.equal(captured.length, 3);
  assert.deepEqual(captured.map((request) => JSON.parse(request.contents).task), [
    "INTERPRET_PATIENT_CONTEXT",
    "GENERATE_NOTIFICATION_MESSAGE",
    "GENERATE_RESPONSE_PLAN",
  ]);
  assert.equal(captured[0].model, model);
  assert.equal(captured[0].config.responseMimeType, "application/json");
  assert.equal(captured[0].config.responseJsonSchema.type, "object");
  assert.equal(captured[1].config.responseMimeType, "text/plain");
  assert.deepEqual(JSON.parse(captured[2].contents).allowedActions, [
    { code: "CHECK_DEVICE_POWER", instructionKo: "의료기기 전원을 확인하세요." },
  ]);

  const serialized = JSON.stringify(captured);
  for (const forbidden of [secretApiKey, "김비공개", "010-1234-5678", "01012345678", "서울시 비공개로 1", "private.test/token"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("잘못된 Gemini JSON은 기존 환자 상태 규칙 fallback으로 처리된다", async () => {
  const client = new GeminiAiClient({
    apiKey: secretApiKey,
    model,
    sdkClient: fakeSdk([{ text: "not-json" }], []),
  });
  const interpreter = new AiPatientContextInterpreter({ client });
  const result = await interpreter.interpret({
    powerProfile: {
      devices: [{ deviceType: "인공호흡기", batteryRuntimeMinutes: 90, runtimeVerified: true, isEssential: true }],
    },
  });

  assert.equal(result.source, "RULE_FALLBACK");
  assert.equal(result.status, "PROPOSED");
  assert.equal(result.reviewRequired, true);
  assert.equal(result.fallbackReason, "AI_CLIENT_ERROR");
});

test("SDK 오류에는 API 키, 환자정보, 전체 프롬프트를 노출하지 않는다", async () => {
  const patientName = "김노출금지";
  const client = new GeminiAiClient({
    apiKey: secretApiKey,
    model,
    sdkClient: fakeSdk([new Error(`${secretApiKey} ${patientName} ${"full-prompt".repeat(100)}`)], []),
  });

  await assert.rejects(
    client.generateMessage({ systemInstruction: "full-prompt", facts: {} }),
    (error) => {
      assert.equal(error instanceof GeminiClientError, true);
      assert.equal(error.code, "GEMINI_REQUEST_FAILED");
      assert.equal(error.message.includes(secretApiKey), false);
      assert.equal(error.message.includes(patientName), false);
      assert.equal(error.stack.includes(secretApiKey), false);
      return true;
    },
  );
});
