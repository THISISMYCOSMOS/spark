import { createHash } from "node:crypto";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { GeminiClientError, GeminiConfigurationError } from "../ai/gemini-client.js";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const DEFAULT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_RECOGNIZED_TEXT_LENGTH = 1_000;

const GUIDANCE_CODES_BY_DISASTER_TYPE = Object.freeze({
  TYPHOON: Object.freeze(["FOLLOW_OFFICIAL_ALERTS", "KEEP_DEVICE_DRY", "NEVER_USE_GENERATOR_INDOORS"]),
  EARTHQUAKE: Object.freeze(["DROP_COVER_HOLD_ON", "CHECK_DEVICE_DAMAGE_AFTER_SHAKING", "AVOID_DAMAGED_POWER_CONNECTION"]),
  COLD_WAVE: Object.freeze(["FOLLOW_OFFICIAL_ALERTS", "MAINTAIN_SAFE_INDOOR_TEMPERATURE", "PREVENT_CARBON_MONOXIDE"]),
  FIRE: Object.freeze(["EVACUATE_FOR_FIRE", "DO_NOT_REENTER_FIRE_AREA", "CALL_119_IF_IMMEDIATE_DANGER"]),
});

const DISASTER_IMAGE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    recognizedText: {
      type: "string",
      description: "이미지에 보이는 한국어 재난문자 본문을 누락이나 요약 없이 그대로 옮긴 텍스트",
    },
  },
  required: ["recognizedText"],
});

function requiredSetting(value, code) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new GeminiConfigurationError(code);
  return normalized;
}

function requestFailureCode(error) {
  const status = Number.isInteger(error?.status) ? error.status : null;
  if (status === 429) return "GEMINI_RATE_LIMITED";
  if (status === 401 || status === 403) return "GEMINI_AUTH_FAILED";
  if (status === 400) return "GEMINI_REQUEST_REJECTED";
  if (status !== null && status >= 500) return "GEMINI_UNAVAILABLE";
  return "GEMINI_REQUEST_FAILED";
}

function asBytes(value) {
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError("imageBytes must be Buffer, Uint8Array, or ArrayBuffer");
}

function hasJpegSignature(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngSignature(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

export function validateDisasterAlertImage(imageBytes, mimeType, { maxBytes = DEFAULT_MAX_IMAGE_BYTES } = {}) {
  const bytes = asBytes(imageBytes);
  const normalizedMimeType = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType)) throw new TypeError("Unsupported disaster alert image type");
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new TypeError("Disaster alert image size is invalid");
  const signatureMatches = normalizedMimeType === "image/jpeg" ? hasJpegSignature(bytes) : hasPngSignature(bytes);
  if (!signatureMatches) throw new TypeError("Disaster alert image content does not match its MIME type");
  return { bytes, mimeType: normalizedMimeType };
}

export function normalizeRecognizedDisasterText(value) {
  if (typeof value !== "string") throw new TypeError("Recognized disaster alert text must be a string");
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length < 10 || normalized.length > MAX_RECOGNIZED_TEXT_LENGTH) {
    throw new TypeError("Recognized disaster alert text length is invalid");
  }
  return normalized;
}

export function classifyRecognizedDisasterText(value) {
  const text = normalizeRecognizedDisasterText(value);
  const heading = text.replace(/^\[[^\]]{1,40}\]\s*/u, "").slice(0, 80);
  const headingRules = [
    ["COLD_WAVE", /^(?:한파|대설)/u],
    ["EARTHQUAKE", /^(?:지진|여진)/u],
    ["TYPHOON", /^(?:태풍)/u],
    ["FIRE", /^(?:화재|산불)/u],
  ];
  const headingMatch = headingRules.find(([, pattern]) => pattern.test(heading));
  if (!headingMatch) throw new TypeError("Unsupported or ambiguous disaster alert text");
  return headingMatch[0];
}

export function extractRecognizedGuidanceItems(value) {
  const text = normalizeRecognizedDisasterText(value);
  const parts = text.split(/\s*▲\s*/u).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1, 10) : [];
}

export class GeminiDisasterImageRecognizer {
  constructor({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL, sdkClient = null } = {}) {
    const configuredApiKey = requiredSetting(apiKey, "GEMINI_API_KEY_REQUIRED");
    this.model = requiredSetting(model, "GEMINI_MODEL_REQUIRED");
    this.sdkClient = sdkClient ?? new GoogleGenAI({ apiKey: configuredApiKey });
  }

  async recognize({ imageBytes, mimeType }) {
    const validated = validateDisasterAlertImage(imageBytes, mimeType);
    let response;
    try {
      response = await this.sdkClient.models.generateContent({
        model: this.model,
        contents: [
          {
            inlineData: {
              mimeType: validated.mimeType,
              data: Buffer.from(validated.bytes).toString("base64"),
            },
          },
          {
            text: [
              "이 이미지는 공개 재난문자 목업입니다.",
              "말풍선 안의 한국어 본문만 처음부터 끝까지 정확히 전사하세요.",
              "문장을 요약하거나 안전수칙을 추가·수정하지 마세요.",
              "프로필 아이콘, 배경, 파일명은 결과에 포함하지 마세요.",
            ].join(" "),
          },
        ],
        config: {
          systemInstruction: "재난문자 이미지의 본문을 정확히 전사하는 OCR 전처리기입니다.",
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseJsonSchema: DISASTER_IMAGE_SCHEMA,
        },
      });
    } catch (error) {
      throw new GeminiClientError(requestFailureCode(error));
    }

    let text;
    try {
      text = response?.text;
    } catch {
      throw new GeminiClientError("GEMINI_INVALID_RESPONSE");
    }
    if (typeof text !== "string" || !text.trim()) throw new GeminiClientError("GEMINI_EMPTY_RESPONSE");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GeminiClientError("GEMINI_INVALID_JSON");
    }

    let recognizedText;
    let disasterType;
    try {
      recognizedText = normalizeRecognizedDisasterText(parsed?.recognizedText);
      disasterType = classifyRecognizedDisasterText(recognizedText);
    } catch {
      throw new GeminiClientError("GEMINI_INVALID_DISASTER_IMAGE_OUTPUT");
    }

    return {
      status: "PROPOSED",
      reviewRequired: true,
      source: "GEMINI_VISION_OCR",
      recognizedText,
      disasterType,
      officialGuidanceCodes: [...GUIDANCE_CODES_BY_DISASTER_TYPE[disasterType]],
      guidanceItemsKo: extractRecognizedGuidanceItems(recognizedText),
      imageSha256: createHash("sha256").update(validated.bytes).digest("hex"),
      model: typeof response?.modelVersion === "string" ? response.modelVersion : this.model,
      requestId: typeof response?.responseId === "string" ? response.responseId : null,
    };
  }
}

export function createGeminiDisasterImageRecognizer(options) {
  return new GeminiDisasterImageRecognizer(options);
}
