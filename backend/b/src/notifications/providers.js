export class MockSmsProvider {
  kind = "MOCK";

  constructor({ failRecipients = [], acceptedAtFactory = null } = {}) {
    this.failRecipients = new Set(failRecipients);
    this.acceptedAtFactory = acceptedAtFactory;
    this.messages = [];
  }

  async send(message) {
    if (this.failRecipients.has(message.to)) throw new Error("MOCK_DELIVERY_FAILURE");
    const result = { providerMessageId: `mock-${this.messages.length + 1}`, accepted: true };
    if (this.acceptedAtFactory) {
      result.providerAcceptedAt = new Date(this.acceptedAtFactory()).toISOString();
    }
    this.messages.push({ ...message, ...result });
    return result;
  }
}

/**
 * SOLAPI SDK에 직접 결합하지 않는 얇은 어댑터.
 * client.sendOne({to, from, text}) 형태의 인증 완료 클라이언트를 주입한다.
 */
export class SolapiSmsProvider {
  kind = "SOLAPI";

  constructor({ client, from }) {
    if (!client || typeof client.sendOne !== "function") {
      throw new TypeError("A SOLAPI client with sendOne() is required");
    }
    if (!from) throw new TypeError("A verified SOLAPI sender number is required");
    this.client = client;
    this.from = from;
  }

  async send({ to, text }) {
    const result = await this.client.sendOne({ to, from: this.from, text });
    return {
      accepted: true,
      providerAcceptedAt: new Date().toISOString(),
      providerMessageId: result.messageId ?? result.groupId ?? null,
      raw: result,
    };
  }
}
