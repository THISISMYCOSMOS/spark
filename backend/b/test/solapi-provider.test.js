import test from "node:test";
import assert from "node:assert/strict";

import {
  DeliveryStatus,
  MockSmsProvider,
  Mode,
  NotificationErrorCode,
  NotificationService,
  NotificationType,
  SolapiSmsProvider,
  createSolapiSmsProviderFromEnv,
} from "../src/index.js";

function acceptedSdkResponse({ messageId = "message-1", groupId = "group-1" } = {}) {
  return {
    failedMessageList: [],
    groupInfo: {
      groupId,
      count: { registeredSuccess: 1, registeredFailed: 0 },
    },
    messageList: [{ messageId, statusCode: "2000", statusMessage: "accepted" }],
  };
}

test("TEST 모드에서는 구성된 SOLAPI client를 호출하지 않는다", async () => {
  let liveCalls = 0;
  const liveProvider = new SolapiSmsProvider({
    from: "01012345678",
    client: {
      async send() {
        liveCalls += 1;
        return acceptedSdkResponse();
      },
    },
  });
  const mockProvider = new MockSmsProvider();
  const service = new NotificationService({ testProvider: mockProvider, liveProvider });

  await service.send({
    mode: Mode.TEST,
    outageId: "outage-test",
    impactCaseId: "case-test",
    recipientType: "PATIENT",
    recipientId: "patient-test",
    to: "01099999999",
    templateType: NotificationType.OUTAGE_STATUS_CHECK,
    text: "TEST only",
    now: "2026-08-14T01:00:00.000Z",
  });

  assert.equal(liveCalls, 0);
  assert.equal(mockProvider.messages.length, 1);
});

test("LIVE SOLAPI 설정값이 누락되면 provider 생성 단계에서 명확히 실패한다", () => {
  assert.throws(
    () => createSolapiSmsProviderFromEnv({ env: {} }),
    /SOLAPI_CONFIG_MISSING:SOLAPI_API_KEY,SOLAPI_API_SECRET,SOLAPI_SENDER_NUMBER/,
  );
});

test("공식 SDK 요청을 매핑하고 성공 응답을 내부 ACCEPTED 결과로 변환한다", async () => {
  const calls = [];
  const provider = new SolapiSmsProvider({
    from: "010-1234-5678",
    clock: () => new Date("2026-08-14T01:02:03.000Z"),
    client: {
      async send(message, config) {
        calls.push({ message, config });
        return acceptedSdkResponse();
      },
    },
  });

  const result = await provider.send({ to: "010-9999-9999", text: "상태를 확인해주세요." });

  assert.deepEqual(calls, [
    {
      message: {
        to: "01099999999",
        from: "01012345678",
        text: "상태를 확인해주세요.",
        autoTypeDetect: true,
      },
      config: { showMessageList: true },
    },
  ]);
  assert.deepEqual(result, {
    status: DeliveryStatus.ACCEPTED,
    provider: "SOLAPI",
    providerMessageId: "message-1",
    errorCode: null,
    retryable: false,
    acceptedAt: "2026-08-14T01:02:03.000Z",
  });
});

test("SOLAPI 인증 오류는 재시도 불가로 정규화한다", async () => {
  const provider = new SolapiSmsProvider({
    from: "01012345678",
    client: {
      async send() {
        throw { _tag: "ClientError", httpStatus: 401, errorCode: "Unauthorized" };
      },
    },
  });

  const result = await provider.send({ to: "01099999999", text: "인증 오류" });
  assert.equal(result.status, DeliveryStatus.FAILED);
  assert.equal(result.errorCode, NotificationErrorCode.AUTHENTICATION_FAILED);
  assert.equal(result.retryable, false);
});

test("SOLAPI 네트워크 오류는 재시도 가능으로 정규화한다", async () => {
  const provider = new SolapiSmsProvider({
    from: "01012345678",
    client: {
      async send() {
        throw { _tag: "NetworkError", code: "ETIMEDOUT" };
      },
    },
  });

  const result = await provider.send({ to: "01099999999", text: "네트워크 오류" });
  assert.equal(result.status, DeliveryStatus.FAILED);
  assert.equal(result.errorCode, NotificationErrorCode.NETWORK_ERROR);
  assert.equal(result.retryable, true);
});

test("잘못된 수신번호는 외부 호출 없이 재시도 불가로 반환한다", async () => {
  let calls = 0;
  const provider = new SolapiSmsProvider({
    from: "01012345678",
    client: {
      async send() {
        calls += 1;
        return acceptedSdkResponse();
      },
    },
  });

  const result = await provider.send({ to: "invalid", text: "번호 오류" });
  assert.equal(calls, 0);
  assert.equal(result.errorCode, NotificationErrorCode.INVALID_RECIPIENT);
  assert.equal(result.retryable, false);
});

test("공급자 거절 코드의 message ID를 보존하고 재시도 여부를 정규화한다", async () => {
  const provider = new SolapiSmsProvider({
    from: "01012345678",
    client: {
      async send() {
        throw {
          _tag: "MessageNotReceivedError",
          failedMessageList: [{ statusCode: "3010", messageId: "rejected-message" }],
        };
      },
    },
  });

  const result = await provider.send({ to: "01099999999", text: "거절 테스트" });
  assert.equal(result.status, DeliveryStatus.FAILED);
  assert.equal(result.providerMessageId, "rejected-message");
  assert.equal(result.errorCode, NotificationErrorCode.INVALID_RECIPIENT);
  assert.equal(result.retryable, false);
});

test("비밀정보나 전화번호를 콘솔에 기록하거나 오류 결과에 포함하지 않는다", async () => {
  const sensitiveSecret = "never-log-this-secret";
  const sensitivePhone = "01099999999";
  const consoleCalls = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args) => consoleCalls.push(args);
  console.log = (...args) => consoleCalls.push(args);

  try {
    const provider = new SolapiSmsProvider({
      from: "01012345678",
      client: {
        async send() {
          throw {
            _tag: "NetworkError",
            message: `${sensitiveSecret}:${sensitivePhone}`,
          };
        },
      },
    });
    const result = await provider.send({ to: sensitivePhone, text: "로그 검사" });
    const serialized = JSON.stringify(result);
    assert.equal(consoleCalls.length, 0);
    assert.equal(serialized.includes(sensitiveSecret), false);
    assert.equal(serialized.includes(sensitivePhone), false);
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});

test("재시도 불가 실패는 NotificationService가 다시 호출하지 않는다", async () => {
  let calls = 0;
  const liveProvider = {
    kind: "SOLAPI",
    async send() {
      calls += 1;
      return {
        status: DeliveryStatus.FAILED,
        provider: "SOLAPI",
        providerMessageId: null,
        errorCode: NotificationErrorCode.AUTHENTICATION_FAILED,
        retryable: false,
        acceptedAt: null,
      };
    },
  };
  const service = new NotificationService({ testProvider: new MockSmsProvider(), liveProvider });
  const sent = await service.send({
    mode: Mode.LIVE,
    outageId: "outage-live",
    impactCaseId: "case-live",
    recipientType: "PATIENT",
    recipientId: "patient-live",
    to: "01099999999",
    templateType: NotificationType.OUTAGE_STATUS_CHECK,
    text: "retry policy",
  });
  await service.retryFailed(sent.delivery.id);
  assert.equal(calls, 1);
});
