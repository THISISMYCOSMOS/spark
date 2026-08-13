import { SolapiMessageService } from "solapi";

import { DeliveryStatus, NotificationErrorCode } from "../contracts.js";

const RETRYABLE_STATUS_CODES = new Set(["1024", "3012", "3024", "3040", "3053"]);
const INVALID_REQUEST_STATUS_CODES = new Set(["1010", "1011", "1013", "1014", "1025", "3013"]);

function iso(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("now must be a valid date");
  return date.toISOString();
}

function normalizedPhone(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function isPhoneNumber(value) {
  return /^\d{8,15}$/.test(value);
}

function acceptedResult({ provider, providerMessageId, acceptedAt }) {
  return {
    status: DeliveryStatus.ACCEPTED,
    provider,
    providerMessageId: providerMessageId ?? null,
    errorCode: null,
    retryable: false,
    acceptedAt: iso(acceptedAt),
  };
}

function failedResult({ provider, providerMessageId = null, errorCode, retryable }) {
  return {
    status: DeliveryStatus.FAILED,
    provider,
    providerMessageId,
    errorCode,
    retryable: Boolean(retryable),
    acceptedAt: null,
  };
}

export class MockSmsProvider {
  kind = "MOCK";

  constructor({ failRecipients = [], clock = () => new Date(), acceptedAtFactory = null } = {}) {
    this.failRecipients = new Set(failRecipients);
    this.clock = clock;
    this.acceptedAtFactory = acceptedAtFactory;
    this.messages = [];
  }

  async send(message, { now } = {}) {
    if (this.failRecipients.has(message.to)) {
      return failedResult({
        provider: this.kind,
        errorCode: "MOCK_DELIVERY_FAILURE",
        retryable: true,
      });
    }

    const result = acceptedResult({
      provider: this.kind,
      providerMessageId: `mock-${this.messages.length + 1}`,
      acceptedAt: this.acceptedAtFactory ? this.acceptedAtFactory() : now ?? this.clock(),
    });
    this.messages.push({ ...message, ...result });
    return result;
  }
}

export function normalizeSolapiError(error) {
  const tag = error?._tag ?? error?.name ?? "";
  const httpStatus = Number(error?.httpStatus ?? error?.status ?? error?.statusCode);
  const providerStatusCode = String(error?.failedMessageList?.[0]?.statusCode ?? "");
  const providerMessageId = error?.failedMessageList?.[0]?.messageId ?? null;

  if (
    tag === "ApiKeyError" ||
    (tag === "ClientError" && [401, 403].includes(httpStatus)) ||
    providerStatusCode === "1020"
  ) {
    return failedResult({
      provider: "SOLAPI",
      providerMessageId,
      errorCode: NotificationErrorCode.AUTHENTICATION_FAILED,
      retryable: false,
    });
  }

  if (tag === "NetworkError" || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(error?.code)) {
    return failedResult({
      provider: "SOLAPI",
      errorCode: NotificationErrorCode.NETWORK_ERROR,
      retryable: true,
    });
  }

  if (httpStatus === 429) {
    return failedResult({
      provider: "SOLAPI",
      errorCode: NotificationErrorCode.RATE_LIMITED,
      retryable: true,
    });
  }

  if (tag === "ServerError" || httpStatus >= 500 || RETRYABLE_STATUS_CODES.has(providerStatusCode)) {
    return failedResult({
      provider: "SOLAPI",
      providerMessageId,
      errorCode: NotificationErrorCode.PROVIDER_UNAVAILABLE,
      retryable: true,
    });
  }

  if (providerStatusCode === "3010") {
    return failedResult({
      provider: "SOLAPI",
      providerMessageId,
      errorCode: NotificationErrorCode.INVALID_RECIPIENT,
      retryable: false,
    });
  }

  if (tag === "BadRequestError" || INVALID_REQUEST_STATUS_CODES.has(providerStatusCode) || httpStatus === 400) {
    return failedResult({
      provider: "SOLAPI",
      providerMessageId,
      errorCode: NotificationErrorCode.INVALID_REQUEST,
      retryable: false,
    });
  }

  if (tag === "MessageNotReceivedError" || providerStatusCode) {
    return failedResult({
      provider: "SOLAPI",
      providerMessageId,
      errorCode: NotificationErrorCode.PROVIDER_REJECTED,
      retryable: false,
    });
  }

  return failedResult({
    provider: "SOLAPI",
    errorCode: NotificationErrorCode.UNEXPECTED_ERROR,
    retryable: false,
  });
}

/** Official SOLAPI Node SDK adapter. It returns only the internal delivery
 * contract and never exposes the SDK response, credentials, or phone numbers. */
export class SolapiSmsProvider {
  kind = "SOLAPI";

  constructor({ client, from, clock = () => new Date() }) {
    if (!client || typeof client.send !== "function") {
      throw new TypeError("A SOLAPI client with send() is required");
    }
    const normalizedFrom = normalizedPhone(from);
    if (!isPhoneNumber(normalizedFrom)) {
      throw new TypeError("A valid registered SOLAPI sender number is required");
    }
    this.client = client;
    this.from = normalizedFrom;
    this.clock = clock;
  }

  async send({ to, text }) {
    const normalizedTo = normalizedPhone(to);
    if (!isPhoneNumber(normalizedTo)) {
      return failedResult({
        provider: this.kind,
        errorCode: NotificationErrorCode.INVALID_RECIPIENT,
        retryable: false,
      });
    }
    if (typeof text !== "string" || text.trim() === "") {
      return failedResult({
        provider: this.kind,
        errorCode: NotificationErrorCode.INVALID_REQUEST,
        retryable: false,
      });
    }

    try {
      const response = await this.client.send(
        { to: normalizedTo, from: this.from, text, autoTypeDetect: true },
        { showMessageList: true },
      );
      const failed = response?.failedMessageList?.[0];
      if (failed) {
        return normalizeSolapiError({
          _tag: "MessageNotReceivedError",
          failedMessageList: [failed],
        });
      }

      const registeredSuccess = response?.groupInfo?.count?.registeredSuccess;
      if (!(typeof registeredSuccess === "number" && registeredSuccess > 0)) {
        return failedResult({
          provider: this.kind,
          errorCode: NotificationErrorCode.INVALID_RESPONSE,
          retryable: false,
        });
      }

      return acceptedResult({
        provider: this.kind,
        providerMessageId: response?.messageList?.[0]?.messageId ?? response?.groupInfo?.groupId ?? null,
        acceptedAt: this.clock(),
      });
    } catch (error) {
      return normalizeSolapiError(error);
    }
  }
}

export function createSolapiSmsProviderFromEnv({
  env = process.env,
  clientFactory = (apiKey, apiSecret) => new SolapiMessageService(apiKey, apiSecret),
  clock,
} = {}) {
  const required = ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER_NUMBER"];
  const missing = required.filter((name) => typeof env[name] !== "string" || env[name].trim() === "");
  if (missing.length > 0) {
    throw new Error(`${NotificationErrorCode.CONFIG_MISSING}:${missing.join(",")}`);
  }

  const apiKey = env.SOLAPI_API_KEY.trim();
  const apiSecret = env.SOLAPI_API_SECRET.trim();
  return new SolapiSmsProvider({
    client: clientFactory(apiKey, apiSecret),
    from: env.SOLAPI_SENDER_NUMBER,
    clock,
  });
}
