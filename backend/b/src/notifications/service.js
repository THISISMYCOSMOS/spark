import { randomUUID } from "node:crypto";

import { DeliveryStatus, Mode, assertOneOf } from "../contracts.js";

function iso(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("now must be a valid date");
  return date.toISOString();
}

export function buildNotificationDeduplicationKey({
  impactCaseId,
  templateType,
  recipientId,
  to,
  escalationRound = 0,
}) {
  return `${impactCaseId}:${templateType}:${recipientId ?? to}:${escalationRound}`;
}

function unexpectedProviderFailure(provider) {
  return {
    status: DeliveryStatus.FAILED,
    provider: provider.kind,
    providerMessageId: null,
    errorCode: `${provider.kind}_UNEXPECTED_ERROR`,
    retryable: false,
    acceptedAt: null,
  };
}

function validateProviderResult(result, provider) {
  if (!result || ![DeliveryStatus.ACCEPTED, DeliveryStatus.FAILED].includes(result.status)) {
    return unexpectedProviderFailure(provider);
  }
  if (result.status === DeliveryStatus.ACCEPTED && !result.acceptedAt) {
    return unexpectedProviderFailure(provider);
  }
  return {
    status: result.status,
    provider: provider.kind,
    providerMessageId: result.providerMessageId ?? null,
    errorCode: result.status === DeliveryStatus.FAILED ? result.errorCode ?? `${provider.kind}_FAILED` : null,
    retryable: result.status === DeliveryStatus.FAILED && Boolean(result.retryable),
    acceptedAt: result.status === DeliveryStatus.ACCEPTED ? iso(result.acceptedAt) : null,
  };
}

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
  constructor({
    testProvider,
    liveProvider = null,
    store = new InMemoryNotificationStore(),
    maxAttempts = 3,
    clock = () => new Date(),
  }) {
    if (!testProvider || testProvider.kind !== "MOCK") {
      throw new TypeError("TEST mode requires MockSmsProvider");
    }
    this.providers = { [Mode.TEST]: testProvider, [Mode.LIVE]: liveProvider };
    this.store = store;
    this.maxAttempts = maxAttempts;
    this.clock = clock;
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
    responseTokenReservationId = null,
    contentMetadata = { source: "TEMPLATE" },
    now = new Date(),
  }) {
    assertOneOf(mode, Mode, "mode");
    const key = buildNotificationDeduplicationKey({ impactCaseId, templateType, recipientId, to, escalationRound });
    const existing = this.store.findByDedupeKey(key);
    if (existing) return { duplicate: true, delivery: existing };

    const provider = this.#providerFor(mode);
    const timestamp = iso(now);
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
      responseTokenReservationId,
      contentSource: contentMetadata?.source ?? "TEMPLATE",
      contentPolicyVersion: contentMetadata?.policyVersion ?? null,
      contentModel: contentMetadata?.model ?? null,
      contentRequestId: contentMetadata?.requestId ?? null,
      contentFallbackReason: contentMetadata?.fallbackReason ?? null,
      provider: provider.kind,
      status: DeliveryStatus.PENDING,
      providerMessageId: null,
      providerAcceptedAt: null,
      errorCode: null,
      retryable: false,
      attempts: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.#attempt(delivery, provider, now);
    return { duplicate: false, delivery };
  }

  async retryFailed(deliveryId, { now = new Date() } = {}) {
    const delivery = this.store.get(deliveryId);
    if (!delivery) throw new Error("NOTIFICATION_NOT_FOUND");
    if (delivery.status !== DeliveryStatus.FAILED) return delivery;
    if (!delivery.retryable || delivery.attempts.length >= this.maxAttempts) return delivery;
    // Re-validate TEST/LIVE provider identity on every retry, not just the initial send.
    const provider = this.#providerFor(delivery.mode);
    await this.#attempt(delivery, provider, now);
    return delivery;
  }

  #providerFor(mode) {
    const provider = this.providers[mode];
    if (!provider) throw new Error(`${mode} SMS provider is not configured`);
    if (mode === Mode.TEST && provider.kind !== "MOCK") throw new Error("TEST_MODE_PROVIDER_VIOLATION");
    if (mode === Mode.LIVE && provider.kind === "MOCK") throw new Error("LIVE_MODE_PROVIDER_VIOLATION");
    return provider;
  }

  async #attempt(delivery, provider, now) {
    const attemptedAt = iso(now);
    let providerResult;
    try {
      providerResult = validateProviderResult(
        await provider.send({ to: delivery.to, text: delivery.text }, { now }),
        provider,
      );
    } catch {
      providerResult = unexpectedProviderFailure(provider);
    }

    delivery.attempts.push({
      attemptedAt,
      status: providerResult.status,
      providerMessageId: providerResult.providerMessageId,
      errorCode: providerResult.errorCode,
      retryable: providerResult.retryable,
      acceptedAt: providerResult.acceptedAt,
    });
    delivery.providerMessageId = providerResult.providerMessageId;
    delivery.providerAcceptedAt = providerResult.acceptedAt;
    delivery.status = providerResult.status;
    delivery.errorCode = providerResult.errorCode;
    delivery.retryable = providerResult.retryable;
    delivery.lastError = providerResult.errorCode;
    delivery.updatedAt = providerResult.acceptedAt ?? iso(now);
    this.store.save(delivery);
  }
}
