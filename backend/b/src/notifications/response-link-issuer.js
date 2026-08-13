import { ResponseTokenPort, portFailure, portSuccess } from "../contracts.js";

/** Backend 1 owns production token issuance, validation, storage, and
 * consumption. Backend 2 only reserves a link before sending and activates it
 * after the provider accepts the message. */

export function buildResponseUrl(baseUrl, token) {
  const url = new URL(`/respond/${encodeURIComponent(token)}`, baseUrl);
  return url.toString();
}

/** TEST-only fake. It models the two-phase port without implementing a
 * production token store or token validation/consumption. */
export class TestResponseLinkIssuer extends ResponseTokenPort {
  constructor({ baseUrl }) {
    super();
    if (!baseUrl) throw new TypeError("baseUrl is required");
    this.baseUrl = baseUrl;
    this.issuedCount = 0;
    this.byIdempotencyKey = new Map();
    this.reservations = new Map();
  }

  reserveLink({ impactCaseId, purpose, now = new Date(), idempotencyKey } = {}) {
    if (!impactCaseId || !purpose) return portFailure("TOKEN_RESERVATION_INVALID", false);
    if (idempotencyKey && this.byIdempotencyKey.has(idempotencyKey)) {
      return portSuccess(this.reservations.get(this.byIdempotencyKey.get(idempotencyKey)));
    }

    this.issuedCount += 1;
    const reservationId = `test-reservation-${this.issuedCount}`;
    const token = `test-link-${this.issuedCount}-${impactCaseId}-${purpose}`;
    const reservation = {
      reservationId,
      token,
      url: buildResponseUrl(this.baseUrl, token),
      impactCaseId,
      purpose,
      reservedAt: new Date(now).toISOString(),
      activatedAt: null,
      expiresAt: null,
    };
    this.reservations.set(reservationId, reservation);
    if (idempotencyKey) this.byIdempotencyKey.set(idempotencyKey, reservationId);
    return portSuccess(reservation);
  }

  activateLink({ reservationId, activatedAt = new Date(), expiresAt } = {}) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return portFailure("TOKEN_RESERVATION_NOT_FOUND", false);
    if (!expiresAt) return portFailure("TOKEN_ACTIVATION_EXPIRY_REQUIRED", false);

    const activatedIso = new Date(activatedAt).toISOString();
    const expiresIso = new Date(expiresAt).toISOString();
    if (reservation.activatedAt) {
      if (reservation.activatedAt !== activatedIso || reservation.expiresAt !== expiresIso) {
        return portFailure("TOKEN_ACTIVATION_CONFLICT", false);
      }
      return portSuccess(reservation);
    }

    reservation.activatedAt = activatedIso;
    reservation.expiresAt = expiresIso;
    return portSuccess(reservation);
  }

  reserveResponseToken(input) {
    return this.reserveLink(input);
  }

  activateResponseToken(input) {
    return this.activateLink(input);
  }

  // Compatibility helper for non-timed links. New StatusCheck flows must use
  // reserveLink + activateLink so expiration starts at provider acceptance.
  issueLink({ impactCaseId, purpose, now = new Date(), expiresAt } = {}) {
    if (!expiresAt) throw new TypeError("expiresAt is required");
    const reserved = this.reserveLink({ impactCaseId, purpose, now });
    if (!reserved.ok) throw new Error(reserved.errorCode);
    const activated = this.activateLink({
      reservationId: reserved.data.reservationId,
      activatedAt: now,
      expiresAt,
    });
    if (!activated.ok) throw new Error(activated.errorCode);
    return activated.data;
  }
}
