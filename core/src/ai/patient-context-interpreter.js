export const PATIENT_CONTEXT_POLICY_VERSION = "PATIENT_CONTEXT_V1";

const DEVICE_CODES = Object.freeze({
  "가정용 인공호흡기": "VENTILATOR",
  "인공호흡기": "VENTILATOR",
  "산소발생기": "OXYGEN_CONCENTRATOR",
  "산소 농축기": "OXYGEN_CONCENTRATOR",
  "흡인기": "SUCTION_DEVICE",
  "투석기": "DIALYSIS_DEVICE",
  "영양펌프": "FEEDING_PUMP",
  "인슐린펌프": "INSULIN_PUMP",
});

const ALLOWED_DEVICE_CODES = new Set([...Object.values(DEVICE_CODES), "OTHER_POWERED_MEDICAL_DEVICE"]);
const ALLOWED_POWER_LEVELS = new Set(["LOW", "HIGH", "LIFE_SUSTAINING", "UNKNOWN"]);
const ALLOWED_COMMUNICATION = new Set(["TEXT_PREFERRED", "VOICE_PREFERRED", "UNKNOWN"]);
const ALLOWED_PRECAUTIONS = new Set([
  "CHECK_DEVICE_POWER",
  "CHECK_BACKUP_POWER",
  "CONTACT_CARE_TEAM_ON_DEVICE_ALARM",
  "FOLLOW_DEVICE_MANUFACTURER_INSTRUCTIONS",
]);

function normalizeDeviceType(value) {
  const normalized = typeof value === "string" ? value.normalize("NFKC").trim() : "";
  return DEVICE_CODES[normalized] ?? "OTHER_POWERED_MEDICAL_DEVICE";
}

function sanitizeClinicalText(value, patient) {
  if (typeof value !== "string") return null;
  let sanitized = value.normalize("NFKC");
  for (const identifier of [patient.name, patient.phone, patient.addressText, patient.address]) {
    if (typeof identifier === "string" && identifier.trim()) {
      sanitized = sanitized.replaceAll(identifier.normalize("NFKC"), "[REDACTED]");
    }
  }
  sanitized = sanitized
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .replace(/(?:\+?82[-\s]?)?0?1[016789](?:[-\s]?\d){7,8}/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized ? sanitized.slice(0, 500) : null;
}

export function buildPatientInterpretationRequest(patient = {}) {
  const profile = patient.powerProfile ?? {};
  return {
    systemInstruction: [
      "환자 등록 정보를 재난 알림용 제한 코드로 구조화하세요.",
      "진단하거나 치료·약물·기기 설정을 제안하지 마세요.",
      "입력에 없는 이동·소통 능력을 추정하지 말고 UNKNOWN 또는 null로 두세요.",
      "허용된 코드만 JSON으로 반환하세요.",
    ].join(" "),
    facts: {
      diagnosisText: sanitizeClinicalText(patient.diagnosis, patient),
      devices: Array.isArray(profile.devices)
        ? profile.devices.map((device) => ({
            deviceType: sanitizeClinicalText(device.deviceType, patient)?.slice(0, 100) ?? null,
            batteryRuntimeMinutes: Number.isFinite(device.batteryRuntimeMinutes) ? device.batteryRuntimeMinutes : null,
            runtimeVerified: Boolean(device.runtimeVerified),
            isEssential: Boolean(device.isEssential),
          }))
        : [],
      backupPowerRuntimeMinutes: Number.isFinite(profile.backupPowerRuntimeMinutes)
        ? profile.backupPowerRuntimeMinutes
        : null,
      backupPowerVerified: Boolean(profile.backupPowerVerified),
    },
    allowed: {
      medicalDeviceTypes: [...ALLOWED_DEVICE_CODES],
      powerDependencyLevels: [...ALLOWED_POWER_LEVELS],
      communicationSupport: [...ALLOWED_COMMUNICATION],
      precautionCodes: [...ALLOWED_PRECAUTIONS],
    },
  };
}

export function buildRuleBasedPatientContext(patient = {}) {
  const profile = patient.powerProfile ?? {};
  const devices = Array.isArray(profile.devices) ? profile.devices : [];
  const essential = devices.filter((device) => device.isEssential !== false);
  const precautions = new Set(["CHECK_DEVICE_POWER", "FOLLOW_DEVICE_MANUFACTURER_INSTRUCTIONS"]);
  if (profile.backupPowerVerified && Number.isFinite(profile.backupPowerRuntimeMinutes)) precautions.add("CHECK_BACKUP_POWER");
  return {
    medicalDeviceTypes: [...new Set(devices.map((device) => normalizeDeviceType(device.deviceType)))],
    powerDependencyLevel: essential.length > 0 ? "HIGH" : "UNKNOWN",
    mobilitySupportRequired: null,
    communicationSupport: "UNKNOWN",
    approvedPrecautionCodes: [...precautions],
  };
}

function validateProposal(value, fallback) {
  if (!value || typeof value !== "object") return null;
  const devices = Array.isArray(value.medicalDeviceTypes)
    ? [...new Set(value.medicalDeviceTypes.filter((item) => ALLOWED_DEVICE_CODES.has(item)))]
    : [];
  if (devices.length === 0) return null;
  if (!ALLOWED_POWER_LEVELS.has(value.powerDependencyLevel)) return null;
  if (!ALLOWED_COMMUNICATION.has(value.communicationSupport)) return null;
  if (value.mobilitySupportRequired !== null && typeof value.mobilitySupportRequired !== "boolean") return null;
  const precautions = Array.isArray(value.approvedPrecautionCodes)
    ? [...new Set(value.approvedPrecautionCodes.filter((item) => ALLOWED_PRECAUTIONS.has(item)))]
    : [];
  return {
    ...fallback,
    medicalDeviceTypes: devices,
    powerDependencyLevel: value.powerDependencyLevel,
    mobilitySupportRequired: value.mobilitySupportRequired,
    communicationSupport: value.communicationSupport,
    approvedPrecautionCodes: [...new Set([...fallback.approvedPrecautionCodes, ...precautions])],
  };
}

export class AiPatientContextInterpreter {
  constructor({ client }) {
    if (!client || typeof client.interpretPatientContext !== "function") {
      throw new TypeError("A patient-context AI client with interpretPatientContext() is required");
    }
    this.client = client;
  }

  async interpret(patient) {
    const fallback = buildRuleBasedPatientContext(patient);
    const request = buildPatientInterpretationRequest(patient);
    let result;
    try {
      result = await this.client.interpretPatientContext(request);
    } catch {
      result = null;
    }
    const proposal = validateProposal(result?.context ?? result, fallback);
    return {
      context: proposal ?? fallback,
      source: proposal ? "AI_PROPOSAL" : "RULE_FALLBACK",
      status: "PROPOSED",
      reviewRequired: true,
      policyVersion: PATIENT_CONTEXT_POLICY_VERSION,
      model: proposal && typeof result?.model === "string" ? result.model : null,
      requestId: proposal && typeof result?.requestId === "string" ? result.requestId : null,
      fallbackReason: proposal ? null : result === null ? "AI_CLIENT_ERROR" : "AI_OUTPUT_INVALID",
    };
  }
}
