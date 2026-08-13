/**
 * Port contract: Backend 2 must not validate or persist production response
 * tokens (v0.1 #7). Backend 1 owns token issuance/validation/storage for real
 * traffic; it injects a ResponseLinkIssuer implementing:
 *   issueLink({ impactCaseId, purpose, now, expiresAt }) => { url, expiresAt }
 * expiresAt is an exact ISO timestamp so the issued link's expiration always
 * matches the caller's real deadline (e.g. StatusCheck.timeoutAt) instead of
 * being independently derived and drifting from it.
 * Backend 2 only calls issueLink() to put a link in an outgoing message.
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
  }

  issueLink({ impactCaseId, purpose, now = new Date(), expiresAt }) {
    if (!expiresAt) throw new TypeError("expiresAt is required");
    this.issuedCount += 1;
    const token = `test-link-${this.issuedCount}-${impactCaseId}-${purpose}`;
    return {
      token,
      url: buildResponseUrl(this.baseUrl, token),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
}
