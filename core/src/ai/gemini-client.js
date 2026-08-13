import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const PATIENT_FACT_KEYS = Object.freeze([
  "medicalDeviceTypes",
  "powerDependencyLevel",
  "mobilitySupportRequired",
  "communicationSupport",
  "approvedPrecautionCodes",
  "responsePlanActionCodes",
  "batteryRuntimeMinutes",
  "verifiedBackupRuntimeMinutes",
  "safetyBufferMinutes",
  "remainingSafetyMinutes",
  "riskLevel",
  "riskReason",
  "patientResponse",
]);

const DISASTER_FACT_KEYS = Object.freeze([
  "disasterType",
  "status",
  "severity",
  "regionCode",
  "startedAt",
  "scheduledStartAt",
  "scheduledEndAt",
  "expectedEndAt",
  "officialGuidanceCodes",
]);

const MESSAGE_PLACEHOLDERS = new Set(["{{PATIENT_NAME}}", "{{RESPONSE_URL}}", "{{STARTS_AT}}"]);

export class GeminiConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "GeminiConfigurationError";
    this.code = code;
  }
}

export class GeminiClientError extends Error {
  constructor(code) {
    super(code);
    this.name = "GeminiClientError";
    this.code = code;
  }
}

function requiredSetting(value, code) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new GeminiConfigurationError(code);
  return normalized;
}

function pick(source, keys) {
  const input = source && typeof source === "object" ? source : {};
  return Object.fromEntries(keys.map((key) => [key, input[key]]));
}

function patientFacts(value) {
  return pick(value, PATIENT_FACT_KEYS);
}

function disasterFacts(value) {
  return pick(value, DISASTER_FACT_KEYS);
}

function patientInterpretationPayload(request) {
  const facts = request?.facts ?? {};
  const allowed = request?.allowed ?? {};
  return {
    task: "INTERPRET_PATIENT_CONTEXT",
    facts: {
      diagnosisText: typeof facts.diagnosisText === "string" ? facts.diagnosisText : null,
      devices: Array.isArray(facts.devices)
        ? facts.devices.map((device) => pick(device, ["deviceType", "batteryRuntimeMinutes", "runtimeVerified", "isEssential"]))
        : [],
      backupPowerRuntimeMinutes: facts.backupPowerRuntimeMinutes,
      backupPowerVerified: facts.backupPowerVerified,
    },
    allowed: {
      medicalDeviceTypes: Array.isArray(allowed.medicalDeviceTypes) ? allowed.medicalDeviceTypes : [],
      powerDependencyLevels: Array.isArray(allowed.powerDependencyLevels) ? allowed.powerDependencyLevels : [],
      communicationSupport: Array.isArray(allowed.communicationSupport) ? allowed.communicationSupport : [],
      precautionCodes: Array.isArray(allowed.precautionCodes) ? allowed.precautionCodes : [],
    },
  };
}

function messagePayload(request) {
  return {
    task: "GENERATE_NOTIFICATION_MESSAGE",
    facts: {
      notificationType: request?.facts?.notificationType ?? null,
      recipientType: request?.facts?.recipientType ?? null,
      patient: patientFacts(request?.facts?.patient),
      disaster: disasterFacts(request?.facts?.disaster),
    },
    requiredPlaceholders: Array.isArray(request?.requiredPlaceholders)
      ? request.requiredPlaceholders.filter((placeholder) => MESSAGE_PLACEHOLDERS.has(placeholder))
      : [],
  };
}

function responsePlanPayload(request) {
  return {
    task: "GENERATE_RESPONSE_PLAN",
    facts: {
      patient: patientFacts(request?.facts?.patient),
      disaster: disasterFacts(request?.facts?.disaster),
    },
    allowedActions: Array.isArray(request?.allowedActions)
      ? request.allowedActions.map((action) => pick(action, ["code", "instructionKo"]))
      : [],
  };
}

function patientContextSchema(allowed = {}) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      medicalDeviceTypes: {
        type: "array",
        items: { type: "string", enum: allowed.medicalDeviceTypes ?? [] },
      },
      powerDependencyLevel: { type: "string", enum: allowed.powerDependencyLevels ?? [] },
      mobilitySupportRequired: { type: ["boolean", "null"] },
      communicationSupport: { type: "string", enum: allowed.communicationSupport ?? [] },
      approvedPrecautionCodes: {
        type: "array",
        items: { type: "string", enum: allowed.precautionCodes ?? [] },
      },
    },
    required: [
      "medicalDeviceTypes",
      "powerDependencyLevel",
      "mobilitySupportRequired",
      "communicationSupport",
      "approvedPrecautionCodes",
    ],
  };
}

export class GeminiAiClient {
  constructor({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL, sdkClient = null } = {}) {
    const configuredApiKey = requiredSetting(apiKey, "GEMINI_API_KEY_REQUIRED");
    this.model = requiredSetting(model, "GEMINI_MODEL_REQUIRED");
    this.sdkClient = sdkClient ?? new GoogleGenAI({ apiKey: configuredApiKey });
  }

  async interpretPatientContext(request) {
    const payload = patientInterpretationPayload(request);
    const generated = await this.#generate({
      systemInstruction: request?.systemInstruction,
      payload,
      maxOutputTokens: 1024,
      responseJsonSchema: patientContextSchema(payload.allowed),
    });
    let context;
    try {
      context = JSON.parse(generated.text);
    } catch {
      throw new GeminiClientError("GEMINI_INVALID_JSON");
    }
    return { context, model: generated.model, requestId: generated.requestId };
  }

  async generateMessage(request) {
    const payload = messagePayload(request);
    const generated = await this.#generate({
      systemInstruction: request?.systemInstruction,
      payload,
      maxOutputTokens: 1024,
    });
    let text = generated.text;
    if (payload.requiredPlaceholders.includes("{{PATIENT_NAME}}") && !text.includes("{{PATIENT_NAME}}")) {
      text = `{{PATIENT_NAME}}님, ${text}`;
    }
    if (payload.requiredPlaceholders.includes("{{STARTS_AT}}") && !text.includes("{{STARTS_AT}}")) {
      text = `${text} 예정 시각: {{STARTS_AT}}`;
    }
    if (payload.requiredPlaceholders.includes("{{RESPONSE_URL}}") && !text.includes("{{RESPONSE_URL}}")) {
      text = `${text} 응답: {{RESPONSE_URL}}`;
    }
    return { ...generated, text };
  }

  async generateResponsePlan(request) {
    return this.#generate({
      systemInstruction: request?.systemInstruction,
      payload: responsePlanPayload(request),
      maxOutputTokens: 1024,
    });
  }

  async #generate({ systemInstruction, payload, maxOutputTokens, responseJsonSchema = null }) {
    let response;
    try {
      response = await this.sdkClient.models.generateContent({
        model: this.model,
        contents: JSON.stringify(payload),
        config: {
          systemInstruction: typeof systemInstruction === "string" ? systemInstruction : "",
          maxOutputTokens,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          ...(responseJsonSchema
            ? { responseMimeType: "application/json", responseJsonSchema }
            : { responseMimeType: "text/plain" }),
        },
      });
    } catch {
      throw new GeminiClientError("GEMINI_REQUEST_FAILED");
    }

    let text;
    try {
      text = response?.text;
    } catch {
      throw new GeminiClientError("GEMINI_INVALID_RESPONSE");
    }
    if (typeof text !== "string" || !text.trim()) throw new GeminiClientError("GEMINI_EMPTY_RESPONSE");
    return {
      text: text.trim(),
      model: typeof response?.modelVersion === "string" ? response.modelVersion : this.model,
      requestId: typeof response?.responseId === "string" ? response.responseId : null,
    };
  }
}

export function createGeminiAiClient(options) {
  return new GeminiAiClient(options);
}
