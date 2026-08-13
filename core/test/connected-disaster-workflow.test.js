import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  AiNotificationComposer,
  AiPatientContextInterpreter,
  AiResponsePlanComposer,
  BackendAHttpClient,
  ConnectedDisasterWorkflow,
  GeminiAiClient,
} from "../src/index.js";
import {
  InMemoryJobQueue,
  MockSmsProvider,
  NotificationService,
  OutageWorkflow,
  TestResponseLinkIssuer,
  renderTemplate,
} from "../../backend/b/src/index.js";

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return { data }; } };
}

test("PDF부터 Backend A HTTP mock, 세 Gemini 역할, Backend B Mock SMS까지 연결한다", async () => {
  const backendARequests = [];
  const backendAResponses = [
    {
      id: "backend-a-outage-1",
      mode: "TEST",
      status: "ACTIVE",
      regionCodes: ["99004"],
      startedAt: "2026-08-14T00:40:00.000Z",
      expectedEndAt: "2026-08-14T04:00:00.000Z",
    },
    { id: "backend-a-case-1", version: 1, updatedAt: "2026-08-14T00:40:00.000Z" },
    { id: "backend-a-case-1", version: 2, status: "WAITING_PATIENT", updatedAt: "2026-08-14T00:40:01.000Z" },
  ];
  const backendAClient = new BackendAHttpClient({
    baseUrl: "https://backend-a.test",
    coreToken: "test-core-token",
    fetchImpl: async (url, options) => {
      backendARequests.push({ url, options });
      return response(backendAResponses.shift());
    },
  });

  const geminiRequests = [];
  const sdkClient = {
    models: {
      async generateContent(request) {
        geminiRequests.push(request);
        const task = JSON.parse(request.contents).task;
        if (task === "INTERPRET_PATIENT_CONTEXT") {
          return {
            text: JSON.stringify({
              medicalDeviceTypes: ["VENTILATOR"],
              powerDependencyLevel: "LIFE_SUSTAINING",
              mobilitySupportRequired: null,
              communicationSupport: "TEXT_PREFERRED",
              approvedPrecautionCodes: ["CHECK_DEVICE_POWER", "CHECK_BACKUP_POWER"],
            }),
            responseId: "patient-ai-1",
          };
        }
        if (task === "GENERATE_RESPONSE_PLAN") {
          return { text: "공식 안내와 등록된 안전 항목을 차례로 확인하세요.", responseId: "plan-ai-1" };
        }
        return {
          text: "{{PATIENT_NAME}}님, 등록된 의료기기 전원을 확인해 주세요. 응답: {{RESPONSE_URL}}",
          responseId: "message-ai-1",
        };
      },
    },
  };
  const aiClient = new GeminiAiClient({ apiKey: "test-gemini-key", model: "test-gemini-model", sdkClient });
  const provider = new MockSmsProvider({ acceptedAtFactory: () => "2026-08-14T00:40:02.000Z" });
  const backendBWorkflow = new OutageWorkflow({
    notificationService: new NotificationService({ testProvider: provider }),
    responseLinkIssuer: new TestResponseLinkIssuer({ baseUrl: "https://response.test" }),
    jobQueue: new InMemoryJobQueue(),
    patientContextInterpreter: null,
    responsePlanComposer: new AiResponsePlanComposer({ client: aiClient }),
    messageComposer: new AiNotificationComposer({ client: aiClient, fallbackRenderer: renderTemplate }),
  });
  const workflow = new ConnectedDisasterWorkflow({
    backendAClient,
    backendBWorkflow,
    patientContextInterpreter: new AiPatientContextInterpreter({ client: aiClient }),
  });
  const pdfBytes = await readFile(fileURLToPath(new URL("../output/pdf/mock-disaster-alert-fire.pdf", import.meta.url)));
  const patientsFromBackendA = [{
    id: "patient-from-a-1",
    name: "김테스트",
    phone: "01012345678",
    addressText: "외부 전송 금지 주소",
    diagnosis: "인공호흡기 사용",
    regionCode: "99004",
    powerProfile: {
      devices: [{ deviceType: "인공호흡기", batteryRuntimeMinutes: 120, runtimeVerified: true, isEssential: true }],
      backupPowerRuntimeMinutes: 30,
      backupPowerVerified: true,
      safetyMarginMinutes: 20,
    },
    emergencyContacts: [],
  }];

  const result = await workflow.run({
    pdfBytes,
    patientsFromBackendA,
    now: "2026-08-14T00:40:00.000Z",
  });

  assert.equal(result.document.disasterType, "FIRE");
  assert.equal(result.outage.id, "backend-a-outage-1");
  assert.equal(result.created[0].id, "backend-a-case-1");
  assert.equal(result.transitions[0].status, "WAITING_PATIENT");
  assert.equal(provider.messages.length, 1);
  assert.match(provider.messages[0].text, /김테스트/);
  assert.match(provider.messages[0].text, /https:\/\/response\.test\/respond\//);
  assert.deepEqual(geminiRequests.map((request) => JSON.parse(request.contents).task), [
    "INTERPRET_PATIENT_CONTEXT",
    "GENERATE_RESPONSE_PLAN",
    "GENERATE_NOTIFICATION_MESSAGE",
  ]);
  assert.deepEqual(backendARequests.map(({ url }) => new URL(url).pathname), [
    "/api/v1/core/disasters",
    "/api/v1/outages/backend-a-outage-1/impact-cases",
    "/api/v1/impact-cases/backend-a-case-1/transitions",
  ]);
  const geminiSerialized = JSON.stringify(geminiRequests);
  assert.equal(geminiSerialized.includes("김테스트"), false);
  assert.equal(geminiSerialized.includes("01012345678"), false);
  assert.equal(geminiSerialized.includes("외부 전송 금지 주소"), false);
});
