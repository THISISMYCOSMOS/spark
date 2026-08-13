/**
 * Port contract: Backend 2 must not validate or persist production response
 * tokens (v0.1 #7). Backend 1 owns token issuance/validation/storage for real
 * traffic; it injects a ResponseLinkIssuer implementing two phases:
 *   reserveLink({ impactCaseId, purpose }) => { linkId, url }
 *   activateLink({ linkId, expiresAt }) => { linkId, expiresAt }
 * The link is reserved for the outgoing message, then activated only after the
 * provider accepts that message. Backend 2 does not validate or persist tokens.
 * issueLink() remains as a compatibility helper for existing non-StatusCheck
 * callers that already know the exact expiration timestamp.
 */

export function buildResponseUrl(baseUrl, token) {
  const url = new URL(`/respond/${encodeURIComponent(token)}`, baseUrl);
  return url.toString();
}

/**
 * TEST-ONLY fake. Issues deterministic, non-persisted links for simulation and
 * unit tests. It must never validate or persist a token — that would make it a
 * production token store, which Backend 2 is not allowed to own.
 */
export class TestResponseLinkIssuer {
  constructor({ baseUrl }) {
    if (!baseUrl) throw new TypeError("baseUrl is required");
    this.baseUrl = baseUrl;
    this.issuedCount = 0;
    this.activations = [];
  }

  reserveLink({ impactCaseId, purpose }) {
    this.issuedCount += 1;
    const linkId = `test-link-${this.issuedCount}-${impactCaseId}-${purpose}`;
    return { linkId, url: buildResponseUrl(this.baseUrl, linkId) };
  }

  activateLink({ linkId, expiresAt }) {
    if (!linkId) throw new TypeError("linkId is required");
    if (!expiresAt) throw new TypeError("expiresAt is required");
    const activated = { linkId, expiresAt: new Date(expiresAt).toISOString() };
    this.activations.push(activated);
    return activated;
  }

  issueLink({ impactCaseId, purpose, now = new Date(), expiresAt }) {
    if (!expiresAt) throw new TypeError("expiresAt is required");
    const reserved = this.reserveLink({ impactCaseId, purpose });
    const activated = this.activateLink({ linkId: reserved.linkId, expiresAt });
    return {
      token: reserved.linkId,
      ...reserved,
      expiresAt: activated.expiresAt,
    };
  }
}
