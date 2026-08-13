import { buildDisasterFacts, buildPatientFacts } from "../ai/context.js";
import { RESPONSE_PLAN_POLICY_VERSION, selectApprovedResponseActions } from "./action-catalog.js";

const FORBIDDEN = [
  /(?:약|투약|복용|인슐린).{0,16}(?:중단|증량|감량|변경|조절)/i,
  /(?:진단|처방)(?:합니다|됩니다|하세요)/i,
  /(?:안전합니다|위험하지 않습니다|생명에 지장이 없습니다)/i,
];

function fallbackNarrative(actions) {
  return actions.map((action) => action.instructionKo).join(" ");
}

function validateNarrative(text) {
  if (!text) return "AI_EMPTY_OUTPUT";
  if (Buffer.byteLength(text, "utf8") > 2000) return "AI_OUTPUT_TOO_LONG";
  if (/https?:\/\//i.test(text) || /\d{8,}/.test(text)) return "AI_UNAPPROVED_CONTACT";
  if (FORBIDDEN.some((pattern) => pattern.test(text))) return "AI_UNSAFE_MEDICAL_DIRECTION";
  for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!["119", "112"].includes(match[0])) return "AI_UNSUPPORTED_NUMBER";
  }
  return null;
}

export function buildAiResponsePlanRequest({ patient, outage, impactCase, actions }) {
  return {
    systemInstruction: [
      "당신은 의료기기 사용 환자의 재난 대응 안내문 작성기입니다.",
      "allowedActions에 있는 내용만 자연스러운 한국어 한 문단으로 정리하세요.",
      "새 행동, 진단, 처방, 약 변경, 기기 설정 변경, 안전 보장을 추가하지 마세요.",
      "이름, 전화번호, 주소, URL을 만들거나 요구하지 마세요.",
      "설명문만 반환하고 JSON이나 Markdown은 반환하지 마세요.",
    ].join(" "),
    facts: {
      patient: buildPatientFacts(patient, impactCase),
      disaster: buildDisasterFacts(outage),
    },
    allowedActions: actions,
  };
}

export class AiResponsePlanComposer {
  constructor({ client }) {
    if (!client || typeof client.generateResponsePlan !== "function") {
      throw new TypeError("An AI response-plan client with generateResponsePlan() is required");
    }
    this.client = client;
  }

  async compose({ patient, outage, impactCase }) {
    const actions = selectApprovedResponseActions({ patient, outage, impactCase });
    const request = buildAiResponsePlanRequest({ patient, outage, impactCase, actions });
    const fallback = fallbackNarrative(actions);
    let result;
    try {
      result = await this.client.generateResponsePlan(request);
    } catch {
      result = null;
    }
    const narrative = typeof (result?.text ?? result) === "string" ? (result?.text ?? result).replace(/\s+/g, " ").trim() : "";
    const fallbackReason = result === null ? "AI_CLIENT_ERROR" : validateNarrative(narrative);
    return {
      status: "PROPOSED",
      reviewRequired: true,
      policyVersion: RESPONSE_PLAN_POLICY_VERSION,
      actions,
      narrative: fallbackReason ? fallback : narrative,
      narrativeSource: fallbackReason ? "RULE_FALLBACK" : "AI",
      model: fallbackReason || typeof result?.model !== "string" ? null : result.model,
      requestId: fallbackReason || typeof result?.requestId !== "string" ? null : result.requestId,
      fallbackReason: fallbackReason ?? null,
    };
  }
}
