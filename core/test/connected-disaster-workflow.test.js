import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  AiNotificationComposer,
  AiPatientContextInterpreter,
  AiResponsePlanComposer,
  BackendAHttpClient,
  BackendAResponseTokenPort,
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
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { data };
    },
  };
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
    {
      id: "backend-a-case-1",
      version: 1,
      updatedAt: "2026-08-14T00:40:00.000Z",
    },
    {
      id: "backend-a-case-1",
      version: 1,
      updatedAt: "2026-08-14T00:40:01.000Z",
    },
    {
      id: "backend-a-case-1",
      version: 2,
      status: "WAITING_PATIENT",
      updatedAt: "2026-08-14T00:40:01.000Z",
    },
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
              approvedPrecautionCodes: [
                "CHECK_DEVICE_POWER",
                "CHECK_BACKUP_POWER",
              ],
            }),
            responseId: "patient-ai-1",
          };
        }
        if (task === "GENERATE_RESPONSE_PLAN") {
          return {
            text: "공식 안내와 등록된 안전 항목을 차례로 확인하세요.",
            responseId: "plan-ai-1",
          };
        }
        return {
          text: "{{PATIENT_NAME}}님, 등록된 의료기기 전원을 확인해 주세요. 응답: {{RESPONSE_URL}}",
          responseId: "message-ai-1",
        };
      },
    },
  };
  const aiClient = new GeminiAiClient({
    apiKey: "test-gemini-key",
    model: "test-gemini-model",
    sdkClient,
  });
  const provider = new MockSmsProvider({
    acceptedAtFactory: () => "2026-08-14T00:40:02.000Z",
  });
  const backendBWorkflow = new OutageWorkflow({
    notificationService: new NotificationService({ testProvider: provider }),
    responseLinkIssuer: new TestResponseLinkIssuer({
      baseUrl: "https://response.test",
    }),
    jobQueue: new InMemoryJobQueue(),
    patientContextInterpreter: null,
    responsePlanComposer: new AiResponsePlanComposer({ client: aiClient }),
    messageComposer: new AiNotificationComposer({
      client: aiClient,
      fallbackRenderer: renderTemplate,
    }),
  });
  const workflow = new ConnectedDisasterWorkflow({
    backendAClient,
    backendBWorkflow,
    patientContextInterpreter: new AiPatientContextInterpreter({
      client: aiClient,
    }),
  });
  const pdfBytes = await readFile(
    fileURLToPath(
      new URL("../output/pdf/mock-disaster-alert-fire.pdf", import.meta.url),
    ),
  );
  const patientsFromBackendA = [
    {
      id: "patient-from-a-1",
      name: "김테스트",
      phone: "01012345678",
      addressText: "외부 전송 금지 주소",
      diagnosis: "인공호흡기 사용",
      regionCode: "99004",
      powerProfile: {
        devices: [
          {
            deviceType: "인공호흡기",
            batteryRuntimeMinutes: 120,
            runtimeVerified: true,
            isEssential: true,
          },
        ],
        backupPowerRuntimeMinutes: 30,
        backupPowerVerified: true,
        safetyMarginMinutes: 20,
      },
      emergencyContacts: [],
    },
  ];

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
  assert.match(
    provider.messages[0].text,
    /https:\/\/response\.test\/respond\//,
  );
  assert.deepEqual(
    geminiRequests.map((request) => JSON.parse(request.contents).task),
    [
      "INTERPRET_PATIENT_CONTEXT",
      "GENERATE_RESPONSE_PLAN",
      "GENERATE_NOTIFICATION_MESSAGE",
    ],
  );
  assert.deepEqual(
    backendARequests.map(({ url }) => new URL(url).pathname),
    [
      "/api/v1/core/disasters",
      "/api/v1/outages/backend-a-outage-1/impact-cases",
      "/api/v1/impact-cases/backend-a-case-1/response-plan",
      "/api/v1/impact-cases/backend-a-case-1/transitions",
    ],
  );
  assert.equal(JSON.parse(backendARequests[1].options.body).status, "PREPARE");
  assert.equal(JSON.parse(backendARequests[2].options.body).status, "PROPOSED");
  assert.equal(
    JSON.parse(backendARequests[2].options.body).reviewRequired,
    true,
  );
  assert.equal(
    JSON.parse(backendARequests[3].options.body).next_status,
    "WAITING_PATIENT",
  );
  const geminiSerialized = JSON.stringify(geminiRequests);
  assert.equal(geminiSerialized.includes("김테스트"), false);
  assert.equal(geminiSerialized.includes("01012345678"), false);
  assert.equal(geminiSerialized.includes("외부 전송 금지 주소"), false);
});

test("환자 목록을 넘기지 않으면 PDF 지역 코드로 Backend A에서 조회한다", async () => {
  const calls = [];
  const backendAClient = {
    async createDisaster(document) {
      calls.push(["createDisaster", document.regionCode]);
      return {
        id: "outage-1",
        mode: "TEST",
        status: "ACTIVE",
        regionCodes: [document.regionCode],
        startedAt: document.startedAt,
        expectedEndAt: document.expectedEndAt,
      };
    },
    async listPatientsByRegion(regionCode) {
      calls.push(["listPatientsByRegion", regionCode]);
      return [];
    },
  };
  const backendBWorkflow = {
    prepare({ patients }) {
      assert.deepEqual(patients, []);
      return { created: [], skipped: [] };
    },
    async executePrepared() {
      return { statusChecks: [] };
    },
  };
  const workflow = new ConnectedDisasterWorkflow({
    backendAClient,
    backendBWorkflow,
  });
  const pdfBytes = await readFile(
    fileURLToPath(
      new URL("../output/pdf/mock-disaster-alert-fire.pdf", import.meta.url),
    ),
  );

  await workflow.run({ pdfBytes, now: "2026-08-14T00:40:00.000Z" });

  assert.deepEqual(calls, [
    ["createDisaster", "99004"],
    ["listPatientsByRegion", "99004"],
  ]);
});

test("Backend A 조회·저장과 Backend B 문자·상태확인을 전체 순서로 연결한다", async () => {
  const requests = [];
  const patientId = "30000000-0000-4000-8000-000000000001";
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, body });
    if (path === "/api/v1/core/disasters") {
      return response({
        id: "40000000-0000-4000-8000-000000000001",
        mode: "TEST",
        status: "ACTIVE",
        regionCodes: ["99004"],
        startedAt: "2026-08-14T00:40:00.000Z",
        expectedEndAt: "2026-08-14T04:00:00.000Z",
      });
    }
    if (path === "/api/v1/core/patients") {
      return response([
        {
          id: patientId,
          name: "통합환자",
          phone: "01012345678",
          regionCode: "99004",
          diagnosis: "호흡기 질환",
          powerProfile: {
            devices: [
              {
                deviceType: "인공호흡기",
                batteryRuntimeMinutes: 120,
                runtimeVerified: true,
                isEssential: true,
              },
            ],
            backupPowerRuntimeMinutes: 30,
            backupPowerVerified: true,
            safetyMarginMinutes: 20,
          },
          emergencyContacts: [],
        },
      ]);
    }
    if (path.endsWith("/impact-cases")) {
      return response(
        {
          id: body.id,
          version: 1,
          status: body.status,
          updatedAt: "2026-08-14T00:40:00.000Z",
        },
        201,
      );
    }
    if (path.endsWith("/status-checks")) {
      return response({ id: body.id, status: "PENDING" }, 201);
    }
    if (path.endsWith("/transitions")) {
      return response({
        id: path.split("/")[4],
        version: 2,
        status: body.next_status,
      });
    }
    throw new Error(`unexpected request: ${path}`);
  };
  const backendAClient = new BackendAHttpClient({
    baseUrl: "https://backend-a.test",
    coreToken: "core-token",
    fetchImpl,
  });
  const backendBWorkflow = new OutageWorkflow({
    notificationService: new NotificationService({
      testProvider: new MockSmsProvider({
        acceptedAtFactory: () => "2026-08-14T00:40:02.000Z",
      }),
    }),
    responseLinkIssuer: new BackendAResponseTokenPort({
      backendAClient,
      responseBaseUrl: "https://frontend.test",
    }),
    jobQueue: new InMemoryJobQueue(),
  });
  const workflow = new ConnectedDisasterWorkflow({
    backendAClient,
    backendBWorkflow,
  });
  const pdfBytes = await readFile(
    fileURLToPath(
      new URL("../output/pdf/mock-disaster-alert-fire.pdf", import.meta.url),
    ),
  );

  const result = await workflow.run({
    pdfBytes,
    now: "2026-08-14T00:40:00.000Z",
  });

  assert.deepEqual(
    requests.map(({ path }) => path),
    [
      "/api/v1/core/disasters",
      "/api/v1/core/patients",
      "/api/v1/outages/40000000-0000-4000-8000-000000000001/impact-cases",
      `/api/v1/impact-cases/${result.created[0].id}/status-checks`,
      `/api/v1/impact-cases/${result.created[0].id}/transitions`,
    ],
  );
  assert.equal(requests[2].body.status, "PREPARE");
  assert.equal(requests[3].body.requested_at, "2026-08-14T00:40:02.000Z");
  assert.equal(
    requests[3].body.provider_accepted_at,
    "2026-08-14T00:40:02.000Z",
  );
  assert.equal(requests[4].body.next_status, "WAITING_PATIENT");
  assert.equal(result.transitions[0].status, "WAITING_PATIENT");
});

test("관리자 복구 보고는 환자 복구 문자가 접수된 건만 RECOVERY_CHECK로 전환한다", async () => {
  const calls = [];
  const backendAClient = {
    async getOutage(outageId) {
      calls.push("getOutage");
      return {
        id: outageId,
        mode: "TEST",
        status: "ACTIVE",
        version: 1,
        disasterType: "FIRE",
        severity: null,
        officialGuidanceCodes: ["EVACUATE_FOR_FIRE"],
        regionCodes: ["11530"],
        startedAt: "2026-08-14T00:00:00Z",
        expectedEndAt: "2026-08-14T03:00:00Z",
      };
    },
    async listImpactCases() {
      calls.push("listImpactCases");
      return [
        {
          id: "case-1",
          patientId: "patient-1",
          status: "MONITORING",
          version: 2,
        },
      ];
    },
    async listPatientsByRegion() {
      calls.push("listPatientsByRegion");
      return [
        {
          id: "patient-1",
          name: "복구환자",
          phone: "01012345678",
          regionCode: "11530",
          diagnosis: "호흡기 질환",
          powerProfile: {
            devices: [
              {
                deviceType: "인공호흡기",
                batteryRuntimeMinutes: 120,
                runtimeVerified: true,
                isEssential: true,
              },
            ],
            backupPowerRuntimeMinutes: 30,
            backupPowerVerified: true,
            safetyMarginMinutes: 20,
          },
          emergencyContacts: [],
        },
      ];
    },
    async reportRegionalRecovery() {
      calls.push("reportRegionalRecovery");
      return {
        id: "outage-1",
        mode: "TEST",
        status: "RECOVERY_REPORTED",
        regionCodes: ["11530"],
        startedAt: "2026-08-14T00:00:00Z",
        expectedEndAt: "2026-08-14T03:00:00Z",
      };
    },
    async registerStatusCheck(input) {
      calls.push("registerStatusCheck");
      return { id: input.id, status: "PENDING" };
    },
    async transitionImpactCase(input) {
      calls.push("transitionImpactCase");
      return { id: input.caseId, version: 3, status: input.nextStatus };
    },
  };
  const backendBWorkflow = new OutageWorkflow({
    notificationService: new NotificationService({
      testProvider: new MockSmsProvider({
        acceptedAtFactory: () => "2026-08-14T03:00:01.000Z",
      }),
    }),
    responseLinkIssuer: new BackendAResponseTokenPort({
      backendAClient,
      responseBaseUrl: "https://frontend.test",
    }),
    jobQueue: new InMemoryJobQueue(),
  });
  const workflow = new ConnectedDisasterWorkflow({
    backendAClient,
    backendBWorkflow,
  });

  const result = await workflow.reportRecovery({
    outageId: "outage-1",
    recoveredAt: "2026-08-14T03:00:00Z",
  });

  assert.equal(result.outage.status, "RECOVERY_REPORTED");
  assert.equal(result.statusChecks.length, 1);
  assert.equal(result.transitions[0].status, "RECOVERY_CHECK");
  assert.deepEqual(calls, [
    "getOutage",
    "listImpactCases",
    "listPatientsByRegion",
    "reportRegionalRecovery",
    "registerStatusCheck",
    "transitionImpactCase",
  ]);
});
