import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import {
  AiNotificationComposer,
  AiPatientContextInterpreter,
  AiResponsePlanComposer,
  BackendAHttpClient,
  BackendAResponseTokenPort,
  ConnectedDisasterWorkflow,
  GeminiAiClient,
  GeminiDisasterImageRecognizer,
} from "./index.js";
import {
  FileJobQueue,
  InMemoryJobQueue,
  MockSmsProvider,
  NotificationService,
  OutageWorkflow,
  renderTemplate,
} from "../../backend/b/src/index.js";

const DEFAULT_MAX_PDF_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_JSON_BYTES = 16 * 1024;
const IMAGE_PROPOSAL_TTL_MS = 15 * 60 * 1000;

const DISASTER_TITLE_KO = Object.freeze({
  TYPHOON: "재난문자 · 태풍",
  EARTHQUAKE: "재난문자 · 지진",
  COLD_WAVE: "재난문자 · 한파",
  FIRE: "재난문자 · 화재",
});

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${name}_REQUIRED`);
  return value.trim();
}

function allowedOrigins(env) {
  return new Set(
    (env.CORE_CORS_ORIGINS ?? "http://127.0.0.1:8080,http://localhost:8080")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function writeJson(response, status, payload, origin, origins) {
  if (origin && origins.has(origin))
    response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

async function readBody(request, maxBytes, tooLargeCode = "REQUEST_TOO_LARGE") {
  const length = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(length) && length > maxBytes)
    throw Object.assign(new Error(tooLargeCode), { status: 413 });
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maxBytes)
      throw Object.assign(new Error(tooLargeCode), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseJson(bytes) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { status: 400 });
  }
}

function imageDocument(proposal, confirmation) {
  const regionCode =
    typeof confirmation?.regionCode === "string"
      ? confirmation.regionCode.trim()
      : "";
  if (!/^\d{5}$/.test(regionCode))
    throw Object.assign(new Error("INVALID_REGION_CODE"), { status: 400 });
  const startedAt = new Date(confirmation?.startedAt);
  const expectedEndAt = new Date(confirmation?.expectedEndAt);
  if (
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(expectedEndAt.getTime())
  ) {
    throw Object.assign(new Error("INVALID_OUTAGE_TIME"), { status: 400 });
  }
  if (expectedEndAt <= startedAt) {
    throw Object.assign(new Error("INVALID_OUTAGE_TIME_RANGE"), {
      status: 400,
    });
  }
  return {
    documentType: "DISASTER_ALERT_IMAGE_V1",
    alertId: `IMAGE-${proposal.imageSha256.slice(0, 24).toUpperCase()}`,
    mode: "TEST",
    status: "ACTIVE",
    disasterType: proposal.disasterType,
    severity: null,
    regionCode,
    issuedAt: startedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    expectedEndAt: expectedEndAt.toISOString(),
    titleKo: DISASTER_TITLE_KO[proposal.disasterType],
    officialGuidanceCodes: proposal.officialGuidanceCodes,
    messageKo: proposal.recognizedText,
    documentSha256: proposal.imageSha256,
    sourceKind: "IMAGE",
  };
}

function errorStatus(error) {
  const rawStatus = Number(error?.status);
  if (rawStatus >= 400 && rawStatus <= 599) return rawStatus;
  return error?.code === "BACKEND_A_NETWORK_ERROR" ? 502 : 400;
}

function safeErrorCode(error, fallback) {
  const code = error?.code ?? error?.message ?? fallback;
  return typeof code === "string" && /^[A-Z0-9_:-]+$/.test(code)
    ? code
    : fallback;
}

function workflowResult(result) {
  const acceptedNotifications = (result.statusCheckResults ?? []).filter(
    (item) => item?.delivery?.status === "ACCEPTED",
  );
  return {
    outage: {
      id: result.outage.id,
      status: result.outage.status,
      regionCode: result.document.regionCode,
      title: result.document.titleKo,
      startedAt: result.outage.startedAt,
      expectedEndAt: result.outage.expectedEndAt,
    },
    matchedPatients: result.patients.length,
    createdCases: result.created.length,
    skippedCases: result.skipped.length,
    acceptedNotifications: acceptedNotifications.length,
    statusChecksStarted: result.statusChecks.length,
    alarmStarted: result.transitions.some(
      (item) => item.status === "WAITING_PATIENT",
    ),
    notificationFailures: (result.notificationFailures ?? []).map((item) => ({
      impactCaseId: item.impactCaseId,
      errorCode: item.errorCode ?? "NOTIFICATION_FAILED",
      retryable: Boolean(item.retryable),
    })),
  };
}

export function createCoreWorkflow(env = process.env) {
  const backendAClient = new BackendAHttpClient({
    baseUrl: required(env, "BACKEND_A_BASE_URL"),
    coreToken: required(env, "BACKEND_A_CORE_TOKEN"),
  });
  const aiClient = new GeminiAiClient({
    apiKey: required(env, "GEMINI_API_KEY"),
    model: required(env, "GEMINI_MODEL"),
  });
  const jobQueue = env.CORE_JOB_STORE_PATH
    ? new FileJobQueue({ filePath: env.CORE_JOB_STORE_PATH })
    : new InMemoryJobQueue();
  const backendBWorkflow = new OutageWorkflow({
    notificationService: new NotificationService({
      testProvider: new MockSmsProvider(),
    }),
    responseLinkIssuer: new BackendAResponseTokenPort({
      backendAClient,
      responseBaseUrl: required(env, "PUBLIC_RESPONSE_BASE_URL"),
    }),
    jobQueue,
    responsePlanComposer: new AiResponsePlanComposer({ client: aiClient }),
    messageComposer: new AiNotificationComposer({
      client: aiClient,
      fallbackRenderer: renderTemplate,
    }),
  });
  return new ConnectedDisasterWorkflow({
    backendAClient,
    backendBWorkflow,
    patientContextInterpreter: new AiPatientContextInterpreter({
      client: aiClient,
    }),
  });
}

export function createCoreServer({
  workflow,
  imageRecognizer = null,
  proposalStore = new Map(),
  env = process.env,
  maxPdfBytes = DEFAULT_MAX_PDF_BYTES,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  now = () => Date.now(),
} = {}) {
  const activeWorkflow = workflow ?? createCoreWorkflow(env);
  let activeImageRecognizer = imageRecognizer;
  const getImageRecognizer = () => {
    activeImageRecognizer ??= new GeminiDisasterImageRecognizer({
      apiKey: required(env, "GEMINI_API_KEY"),
      model: required(env, "GEMINI_MODEL"),
    });
    return activeImageRecognizer;
  };
  const origins = allowedOrigins(env);
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const url = new URL(request.url ?? "/", "http://core.local");

    if (request.method === "OPTIONS") {
      if (origin && origins.has(origin))
        response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(
        response,
        200,
        { data: { status: "UP" }, error: null },
        origin,
        origins,
      );
      return;
    }
    try {
      const recoveryMatch = url.pathname.match(
        /^\/api\/v1\/outages\/([^/]+)\/recovery$/,
      );
      if (request.method === "POST" && recoveryMatch) {
        if (
          !(request.headers["content-type"] ?? "")
            .toLowerCase()
            .startsWith("application/json")
        ) {
          throw Object.assign(new Error("JSON_REQUIRED"), { status: 415 });
        }
        const input = parseJson(
          await readBody(request, DEFAULT_MAX_JSON_BYTES, "JSON_TOO_LARGE"),
        );
        const recoveredAt = new Date(input?.recoveredAt);
        if (Number.isNaN(recoveredAt.getTime())) {
          throw Object.assign(new Error("INVALID_RECOVERY_TIME"), {
            status: 400,
          });
        }
        const result = await activeWorkflow.reportRecovery({
          outageId: decodeURIComponent(recoveryMatch[1]),
          recoveredAt,
          source: "관리자 복구 버튼",
        });
        writeJson(
          response,
          200,
          {
            data: {
              outageId: result.outage.id,
              outageStatus: result.outage.status,
              affectedCases: result.impactCases.length,
              recoveryChecksStarted: result.statusChecks.length,
              transitionedCases: result.transitions.length,
              notificationFailures: result.notificationFailures.map((item) => ({
                impactCaseId: item.impactCaseId,
                errorCode: item.errorCode ?? "NOTIFICATION_FAILED",
                retryable: Boolean(item.retryable),
              })),
            },
            error: null,
          },
          origin,
          origins,
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v1/disasters/recognize-image"
      ) {
        const mimeType = (request.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (!new Set(["image/jpeg", "image/png"]).has(mimeType)) {
          throw Object.assign(new Error("DISASTER_IMAGE_REQUIRED"), {
            status: 415,
          });
        }
        const imageBytes = await readBody(
          request,
          maxImageBytes,
          "DISASTER_IMAGE_TOO_LARGE",
        );
        const proposal = await getImageRecognizer().recognize({
          imageBytes,
          mimeType,
        });
        const proposalId = randomUUID();
        const expiresAt = now() + IMAGE_PROPOSAL_TTL_MS;
        proposalStore.set(proposalId, { proposal, expiresAt });
        for (const [id, stored] of proposalStore) {
          if (stored.expiresAt <= now()) proposalStore.delete(id);
        }
        writeJson(
          response,
          200,
          {
            data: {
              proposalId,
              expiresAt: new Date(expiresAt).toISOString(),
              status: proposal.status,
              reviewRequired: proposal.reviewRequired,
              recognizedText: proposal.recognizedText,
              disasterType: proposal.disasterType,
              guidanceItemsKo: proposal.guidanceItemsKo,
            },
            error: null,
          },
          origin,
          origins,
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v1/disasters/process-image"
      ) {
        if (
          !(request.headers["content-type"] ?? "")
            .toLowerCase()
            .startsWith("application/json")
        ) {
          throw Object.assign(new Error("JSON_REQUIRED"), { status: 415 });
        }
        const confirmation = parseJson(
          await readBody(request, DEFAULT_MAX_JSON_BYTES, "JSON_TOO_LARGE"),
        );
        const stored = proposalStore.get(confirmation?.proposalId);
        if (!stored || stored.expiresAt <= now()) {
          if (confirmation?.proposalId)
            proposalStore.delete(confirmation.proposalId);
          throw Object.assign(new Error("IMAGE_PROPOSAL_EXPIRED"), {
            status: 410,
          });
        }
        const document = imageDocument(stored.proposal, confirmation);
        const result = await activeWorkflow.runDocument({
          document,
          now: new Date(now()),
        });
        proposalStore.delete(confirmation.proposalId);
        writeJson(
          response,
          200,
          { data: workflowResult(result), error: null },
          origin,
          origins,
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/v1/disasters/process"
      ) {
        if (
          !(request.headers["content-type"] ?? "")
            .toLowerCase()
            .startsWith("application/pdf")
        ) {
          throw Object.assign(new Error("PDF_REQUIRED"), { status: 415 });
        }
        const pdfBytes = await readBody(request, maxPdfBytes, "PDF_TOO_LARGE");
        const result = await activeWorkflow.run({
          pdfBytes,
          now: new Date(now()),
        });
        writeJson(
          response,
          200,
          { data: workflowResult(result), error: null },
          origin,
          origins,
        );
        return;
      }

      writeJson(
        response,
        404,
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "요청 경로를 찾을 수 없습니다.",
          },
        },
        origin,
        origins,
      );
    } catch (error) {
      writeJson(
        response,
        errorStatus(error),
        {
          data: null,
          error: {
            code: safeErrorCode(error, "DISASTER_PROCESSING_FAILED"),
            message:
              "재난 알림을 처리하지 못했습니다. 파일과 확인 정보를 다시 확인해 주세요.",
          },
        },
        origin,
        origins,
      );
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = process.env.CORE_HOST ?? "127.0.0.1";
  const port = Number(process.env.CORE_PORT ?? 8100);
  const server = createCoreServer();
  server.listen(port, host, () => {
    console.log(`Core server listening on http://${host}:${port}`);
  });
}
