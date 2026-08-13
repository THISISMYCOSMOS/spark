import { randomUUID } from "node:crypto";
import { DeliveryStatus, Mode, assertOneOf } from "../contracts.js";

export class InMemoryNotificationStore {
  constructor() {
    this.deliveries = new Map();
    this.byDedupeKey = new Map();
  }

  findByDedupeKey(key) {
    const id = this.byDedupeKey.get(key);
    return id ? this.deliveries.get(id) : null;
  }

  save(delivery) {
    this.deliveries.set(delivery.id, delivery);
    this.byDedupeKey.set(delivery.deduplicationKey, delivery.id);
    return delivery;
  }

  get(id) {
    return this.deliveries.get(id) ?? null;
  }

  listFailed() {
    return [...this.deliveries.values()].filter((item) => item.status === DeliveryStatus.FAILED);
  }
}

export class NotificationService {
  constructor({ testProvider, liveProvider = null, store = new InMemoryNotificationStore(), maxAttempts = 3 }) {
    if (!testProvider || testProvider.kind !== "MOCK") {
      throw new TypeError("TEST mode requires MockSmsProvider");
    }
    this.providers = { [Mode.TEST]: testProvider, [Mode.LIVE]: liveProvider };
    this.store = store;
    this.maxAttempts = maxAttempts;
  }

  async send({
    mode,
    outageId,
    impactCaseId,
    recipientType,
    recipientId,
    to,
    templateType,
    text,
    escalationRound = 0,
  }) {
    assertOneOf(mode, Mode, "mode");
    // Identity: caseId + notificationType + recipientId + escalationRound (v0.1 #6).
    // Callers cannot override this — it is the canonical dedup key, not a param.
    const key = `${impactCaseId}:${templateType}:${recipientId ?? to}:${escalationRound}`;
    const existing = this.store.findByDedupeKey(key);
    if (existing) return { duplicate: true, delivery: existing };

    const provider = this.#providerFor(mode);

    const delivery = this.store.save({
      id: randomUUID(),
      mode,
      outageId,
      impactCaseId,
      recipientType,
      recipientId: recipientId ?? to,
      to,
      templateType,
      text,
      escalationRound,
      deduplicationKey: key,
      provider: provider.kind,
      status: DeliveryStatus.PENDING,
      attempts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await this.#attempt(delivery, provider);
    return { duplicate: false, delivery };
  }

  async retryFailed(deliveryId) {
    const delivery = this.store.get(deliveryId);
    if (!delivery) throw new Error("NOTIFICATION_NOT_FOUND");
    if (delivery.status !== DeliveryStatus.FAILED) return delivery;
    if (delivery.attempts.length >= this.maxAttempts) return delivery;
    // Re-validate TEST/LIVE provider identity on every retry, not just the initial send.
    const provider = this.#providerFor(delivery.mode);
    await this.#attempt(delivery, provider);
    return delivery;
  }

  #providerFor(mode) {
    const provider = this.providers[mode];
    if (!provider) throw new Error(`${mode} SMS provider is not configured`);
    if (mode === Mode.TEST && provider.kind !== "MOCK") throw new Error("TEST_MODE_PROVIDER_VIOLATION");
    if (mode === Mode.LIVE && provider.kind === "MOCK") throw new Error("LIVE_MODE_PROVIDER_VIOLATION");
    return provider;
  }

  async #attempt(delivery, provider) {
    const attemptedAt = new Date().toISOString();
    try {
      const result = await provider.send({ to: delivery.to, text: delivery.text });
      delivery.attempts.push({ attemptedAt, ok: true, providerMessageId: result.providerMessageId });
      delivery.providerMessageId = result.providerMessageId;
      delivery.status = DeliveryStatus.SENT;
      delivery.lastError = null;
    } catch (error) {
      delivery.attempts.push({ attemptedAt, ok: false, error: error.message });
      delivery.status = DeliveryStatus.FAILED;
      delivery.lastError = error.message;
    }
    delivery.updatedAt = new Date().toISOString();
    this.store.save(delivery);
  }
}
