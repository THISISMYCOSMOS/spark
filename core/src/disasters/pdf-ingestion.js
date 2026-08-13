import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const Mode = Object.freeze({ TEST: "TEST" });
const OutageStatus = Object.freeze({ ACTIVE: "ACTIVE" });

function portSuccess(data = {}) {
  return { ok: true, data };
}

function portFailure(errorCode, retryable = false) {
  return { ok: false, errorCode, retryable: Boolean(retryable) };
}

export const MOCK_DISASTER_DOCUMENT_TYPE = "MOCK_DISASTER_ALERT_V1";
export const SUPPORTED_DISASTER_TYPES = Object.freeze(["TYPHOON", "EARTHQUAKE", "COLD_WAVE", "FIRE"]);

const REQUIRED_FIELDS = Object.freeze([
  "DOCUMENT_TYPE",
  "ALERT_ID",
  "MODE",
  "DISASTER_TYPE",
  "STATUS",
  "SEVERITY",
  "REGION_CODE",
  "ISSUED_AT",
  "EFFECTIVE_AT",
  "EXPECTED_END_AT",
  "TITLE_KO",
  "GUIDANCE_CODES",
  "MESSAGE_KO",
]);

function asBytes(value) {
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError("pdfBytes must be Buffer, Uint8Array, or ArrayBuffer");
}

function parseIso(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${fieldName} must be an ISO date-time`);
  return date.toISOString();
}

function parseFields(text) {
  const fields = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([A-Z][A-Z0-9_]{1,63}):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (Object.hasOwn(fields, key)) throw new TypeError(`Duplicate PDF field: ${key}`);
    fields[key] = value.trim();
  }
  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) throw new TypeError(`Missing PDF field: ${field}`);
  }
  return fields;
}

function validateFields(fields) {
  if (fields.DOCUMENT_TYPE !== MOCK_DISASTER_DOCUMENT_TYPE) throw new TypeError("Unsupported mock PDF document type");
  if (fields.MODE !== Mode.TEST) throw new TypeError("Mock disaster PDF must use TEST mode");
  if (fields.STATUS !== OutageStatus.ACTIVE) throw new TypeError("Mock disaster PDF must request ACTIVE status");
  if (!SUPPORTED_DISASTER_TYPES.includes(fields.DISASTER_TYPE)) throw new TypeError("Unsupported disaster type");
  if (!/^[A-Z0-9][A-Z0-9_-]{4,79}$/.test(fields.ALERT_ID)) throw new TypeError("Invalid ALERT_ID");
  if (!/^(ADVISORY|WATCH|WARNING|SEVERE)$/.test(fields.SEVERITY)) throw new TypeError("Invalid SEVERITY");
  if (!/^99\d{3}$/.test(fields.REGION_CODE)) throw new TypeError("Mock PDF must use a reserved 99xxx region code");
  if (fields.TITLE_KO.length > 100 || fields.MESSAGE_KO.length > 500) throw new TypeError("Mock PDF text is too long");
  const officialGuidanceCodes = fields.GUIDANCE_CODES.split(",").map((value) => value.trim()).filter(Boolean);
  if (officialGuidanceCodes.length === 0 || officialGuidanceCodes.some((value) => !/^[A-Z][A-Z0-9_]{2,63}$/.test(value))) {
    throw new TypeError("Invalid GUIDANCE_CODES");
  }
  const issuedAt = parseIso(fields.ISSUED_AT, "ISSUED_AT");
  const startedAt = parseIso(fields.EFFECTIVE_AT, "EFFECTIVE_AT");
  const expectedEndAt = parseIso(fields.EXPECTED_END_AT, "EXPECTED_END_AT");
  if (new Date(expectedEndAt) <= new Date(startedAt)) throw new TypeError("EXPECTED_END_AT must be after EFFECTIVE_AT");
  return { officialGuidanceCodes, issuedAt, startedAt, expectedEndAt };
}

export async function extractPdfText(pdfBytes, { maxBytes = 5 * 1024 * 1024, maxPages = 3 } = {}) {
  const bytes = asBytes(pdfBytes);
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new TypeError("PDF file size is invalid");
  if (new TextDecoder("latin1").decode(bytes.slice(0, 5)) !== "%PDF-") throw new TypeError("File is not a PDF");

  const loadingTask = getDocument({ data: bytes, disableWorker: true, useSystemFonts: true });
  const document = await loadingTask.promise;
  try {
    if (document.numPages < 1 || document.numPages > maxPages) throw new TypeError("PDF page count is invalid");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      let line = "";
      for (const item of content.items) {
        line += "str" in item ? item.str : "";
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      pages.push(lines.join("\n"));
      page.cleanup();
    }
    return pages.join("\n");
  } finally {
    await loadingTask.destroy();
  }
}

export async function parseMockDisasterPdf(pdfBytes) {
  const bytes = asBytes(pdfBytes);
  const text = await extractPdfText(bytes);
  const fields = parseFields(text);
  const validated = validateFields(fields);
  const documentSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    documentType: fields.DOCUMENT_TYPE,
    alertId: fields.ALERT_ID,
    mode: fields.MODE,
    disasterType: fields.DISASTER_TYPE,
    status: fields.STATUS,
    severity: fields.SEVERITY,
    regionCode: fields.REGION_CODE,
    issuedAt: validated.issuedAt,
    startedAt: validated.startedAt,
    expectedEndAt: validated.expectedEndAt,
    titleKo: fields.TITLE_KO,
    officialGuidanceCodes: validated.officialGuidanceCodes,
    messageKo: fields.MESSAGE_KO,
    documentSha256,
  };
}

export function buildDisasterActivationCommand(document) {
  return {
    type: "ACTIVATE_DISASTER",
    idempotencyKey: `MOCK_PDF:${document.alertId}:${document.documentSha256}`,
    source: "MOCK_PDF_UPLOAD",
    evidence: { documentType: document.documentType, documentSha256: document.documentSha256 },
    outage: {
      id: document.alertId,
      mode: Mode.TEST,
      status: OutageStatus.ACTIVE,
      disasterType: document.disasterType,
      severity: document.severity,
      regionCode: document.regionCode,
      startedAt: document.startedAt,
      expectedEndAt: document.expectedEndAt,
      officialGuidanceCodes: document.officialGuidanceCodes,
      sourceIssuedAt: document.issuedAt,
      sourceTitle: document.titleKo,
      sourceMessage: document.messageKo,
    },
  };
}

export async function ingestMockDisasterPdf({ pdfBytes, activationPort }) {
  if (!activationPort || typeof activationPort.activateDisaster !== "function") {
    throw new TypeError("A disaster activation port with activateDisaster() is required");
  }
  let document;
  try {
    document = await parseMockDisasterPdf(pdfBytes);
  } catch (error) {
    return portFailure(error instanceof TypeError ? "INVALID_MOCK_DISASTER_PDF" : "PDF_EXTRACTION_FAILED", false);
  }
  const command = buildDisasterActivationCommand(document);
  const result = await activationPort.activateDisaster(command);
  if (!result?.ok) return portFailure(result?.errorCode ?? "DISASTER_ACTIVATION_FAILED", Boolean(result?.retryable));
  return portSuccess({ document, command, activation: result.data ?? {} });
}
