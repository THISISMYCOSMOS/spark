function trimBaseUrl(value) {
  if (!value) throw new TypeError("BACKEND_A_BASE_URL is required");
  return value.replace(/\/+$/, "");
}
function idempotencyKey(prefix, value) {
  return `${prefix}:${value}`.slice(0, 100);
}

export class BackendAHttpError extends Error {
  constructor(code, status, retryable) {
    super(code);
    this.name = "BackendAHttpError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export class BackendAHttpClient {
  constructor({ baseUrl, coreToken, fetchImpl = fetch, riskPolicyId = "00000000-0000-0000-0000-000000000001", riskPolicyVersion = 1 }) {
    if (!coreToken) throw new TypeError("BACKEND_A_CORE_TOKEN is required");
    if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
    this.baseUrl = trimBaseUrl(baseUrl);
    this.coreToken = coreToken;
    this.fetchImpl = fetchImpl;
    this.riskPolicyId = riskPolicyId;
    this.riskPolicyVersion = riskPolicyVersion;
  }

  async createDisaster(document) {
    return this.#request("/api/v1/core/disasters", {
      method: "POST",
      idempotencyKey: idempotencyKey("pdf", document.documentSha256),
      body: {
        title: document.titleKo,
        outage_type: "UNPLANNED",
        disaster_type: document.disasterType,
        severity: document.severity,
        official_guidance_codes: document.officialGuidanceCodes,
        source_document_sha256: document.documentSha256,
        mode: "TEST",
        region_codes: [document.regionCode],
        started_at: document.startedAt,
        expected_end_at: document.expectedEndAt,
        source: `MOCK_PDF:${document.alertId}`,
        description: document.messageKo,
        reason: "검증된 목업 재난 PDF 수신",
      },
    });
  }

  async listPatientsByRegion(regionCode) {
    if (!regionCode) throw new TypeError("regionCode is required");
    return this.#request(`/api/v1/core/patients?regionCode=${encodeURIComponent(regionCode)}`, {
      method: "GET",
    });
  }

  async createImpactCase(outageId, impactCase) {
    const known = impactCase.safetyTime?.status === "KNOWN";
    return this.#request(`/api/v1/outages/${encodeURIComponent(outageId)}/impact-cases`, {
      method: "POST",
      idempotencyKey: idempotencyKey("case", `${outageId}:${impactCase.patientId}`),
      body: {
        id: impactCase.id,
        patient_id: impactCase.patientId,
        status: impactCase.status,
        risk_level: impactCase.riskLevel,
        risk_policy_id: this.riskPolicyId,
        risk_policy_version: this.riskPolicyVersion,
        effective_runtime_minutes: known ? impactCase.safetyTime.effectiveRuntimeMinutes : null,
        runtime_unknown_reason: known ? null : impactCase.safetyTime?.reason ?? "SAFETY_TIME_UNKNOWN",
        response_due_at: null,
        risk_calculated_at: impactCase.updatedAt,
        risk_reason: impactCase.riskReason,
      },
    });
  }

  async transitionImpactCase({ caseId, nextStatus, version, reason }) {
    return this.#request(`/api/v1/impact-cases/${encodeURIComponent(caseId)}/transitions`, {
      method: "POST",
      idempotencyKey: idempotencyKey("transition", `${caseId}:${version}:${nextStatus}`),
      body: { next_status: nextStatus, version, reason },
    });
  }

  async registerStatusCheck({ id, caseId, purpose, token, providerAcceptedAt, responseDueAt, tokenExpiresAt, idempotencyKey: key }) {
    return this.#request(`/api/v1/impact-cases/${encodeURIComponent(caseId)}/status-checks`, {
      method: "POST",
      idempotencyKey: idempotencyKey("check", key),
      body: {
        id,
        purpose: purpose === "OUTAGE_STATUS" ? "OUTAGE_CHECK" : "RECOVERY_CHECK",
        token,
        requested_at: providerAcceptedAt,
        provider_accepted_at: providerAcceptedAt,
        response_due_at: responseDueAt,
        token_expires_at: tokenExpiresAt,
      },
    });
  }

  async #request(path, { method, body, idempotencyKey: key }) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.coreToken}`,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new BackendAHttpError("BACKEND_A_NETWORK_ERROR", 0, true);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new BackendAHttpError("BACKEND_A_INVALID_RESPONSE", response.status, response.status >= 500);
    }
    if (!response.ok || payload?.error) {
      throw new BackendAHttpError(payload?.error?.code ?? "BACKEND_A_REQUEST_FAILED", response.status, response.status >= 500 || response.status === 429);
    }
    return payload.data;
  }
}
