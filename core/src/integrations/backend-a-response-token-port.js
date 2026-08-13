import { randomBytes, randomUUID } from "node:crypto";

export class BackendAResponseTokenPort {
  constructor({ backendAClient, responseBaseUrl }) {
    if (!backendAClient) throw new TypeError("backendAClient is required");
    if (!responseBaseUrl) throw new TypeError("PUBLIC_RESPONSE_BASE_URL is required");
    this.backendAClient = backendAClient;
    this.responseBaseUrl = responseBaseUrl;
    this.reservations = new Map();
    this.byIdempotencyKey = new Map();
  }

  reserveLink({ impactCaseId, purpose, now = new Date(), idempotencyKey }) {
    if (idempotencyKey && this.byIdempotencyKey.has(idempotencyKey)) {
      return { ok: true, data: this.reservations.get(this.byIdempotencyKey.get(idempotencyKey)) };
    }
    const reservationId = randomUUID();
    const token = randomBytes(24).toString("base64url");
    const reservation = {
      reservationId,
      token,
      url: new URL(`/check-in/${encodeURIComponent(token)}`, this.responseBaseUrl).toString(),
      impactCaseId,
      purpose,
      requestedAt: new Date(now).toISOString(),
      idempotencyKey: idempotencyKey ?? reservationId,
      activatedAt: null,
      expiresAt: null,
      statusCheckId: null,
    };
    this.reservations.set(reservationId, reservation);
    if (idempotencyKey) this.byIdempotencyKey.set(idempotencyKey, reservationId);
    return { ok: true, data: reservation };
  }

  async activateLink({ reservationId, activatedAt, expiresAt }) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return { ok: false, errorCode: "TOKEN_RESERVATION_NOT_FOUND", retryable: false };
    if (reservation.activatedAt) return { ok: true, data: reservation };
    try {
      const check = await this.backendAClient.registerStatusCheck({
        id: reservation.reservationId,
        caseId: reservation.impactCaseId,
        purpose: reservation.purpose,
        token: reservation.token,
        providerAcceptedAt: new Date(activatedAt).toISOString(),
        responseDueAt: new Date(expiresAt).toISOString(),
        tokenExpiresAt: new Date(expiresAt).toISOString(),
        idempotencyKey: reservation.idempotencyKey,
      });
      reservation.activatedAt = new Date(activatedAt).toISOString();
      reservation.expiresAt = new Date(expiresAt).toISOString();
      reservation.statusCheckId = check.id;
      return { ok: true, data: reservation };
    } catch (error) {
      return { ok: false, errorCode: error?.code ?? "TOKEN_ACTIVATION_FAILED", retryable: Boolean(error?.retryable) };
    }
  }
}
