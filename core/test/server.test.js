import test from "node:test";
import assert from "node:assert/strict";

import { createCoreServer } from "../src/server.js";

function result() {
  return {
    document: { regionCode: "99004", titleKo: "테스트 정전" },
    outage: {
      id: "outage-1",
      status: "ACTIVE",
      startedAt: "2026-08-14T00:00:00Z",
      expectedEndAt: null,
    },
    patients: [{ id: "patient-1" }],
    created: [{ id: "case-1" }],
    skipped: [],
    statusCheckResults: [{ delivery: { status: "ACCEPTED" } }],
    statusChecks: [{ id: "check-1" }],
    transitions: [{ status: "WAITING_PATIENT" }],
    notificationFailures: [],
  };
}

async function withServer(options, callback) {
  const server = createCoreServer(
    "workflow" in options ? options : { workflow: options },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("PDF 처리 API는 문자 ACCEPTED 이후 시작된 알람 결과를 반환한다", async () => {
  let received;
  await withServer(
    {
      async run(input) {
        received = input;
        return result();
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/disasters/process`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-test"),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.data.acceptedNotifications, 1);
      assert.equal(payload.data.statusChecksStarted, 1);
      assert.equal(payload.data.alarmStarted, true);
      assert.equal(Buffer.from(received.pdfBytes).toString(), "%PDF-test");
    },
  );
});

test("JPEG 판독 제안은 관리자 확인 지역·시간으로만 재난 처리를 시작한다", async () => {
  let receivedDocument;
  const proposalStore = new Map();
  await withServer(
    {
      workflow: {
        async runDocument({ document }) {
          receivedDocument = document;
          return {
            ...result(),
            document,
            outage: {
              ...result().outage,
              startedAt: document.startedAt,
              expectedEndAt: document.expectedEndAt,
            },
          };
        },
      },
      imageRecognizer: {
        async recognize() {
          return {
            status: "PROPOSED",
            reviewRequired: true,
            recognizedText:
              "화재 발생에 주의바랍니다 ▲신속히 안전한 장소로 대피",
            disasterType: "FIRE",
            officialGuidanceCodes: ["EVACUATE_FOR_FIRE"],
            guidanceItemsKo: ["신속히 안전한 장소로 대피"],
            imageSha256: "a".repeat(64),
          };
        },
      },
      proposalStore,
      now: () => Date.parse("2026-08-14T00:00:00Z"),
    },
    async (baseUrl) => {
      const recognitionResponse = await fetch(
        `${baseUrl}/api/v1/disasters/recognize-image`,
        {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        },
      );
      assert.equal(recognitionResponse.status, 200);
      const recognition = await recognitionResponse.json();
      assert.equal(recognition.data.reviewRequired, true);

      const processResponse = await fetch(
        `${baseUrl}/api/v1/disasters/process-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: recognition.data.proposalId,
            regionCode: "11530",
            startedAt: "2026-08-14T09:00:00+09:00",
            expectedEndAt: "2026-08-14T12:00:00+09:00",
          }),
        },
      );
      assert.equal(processResponse.status, 200);
      assert.equal(receivedDocument.regionCode, "11530");
      assert.equal(receivedDocument.disasterType, "FIRE");
      assert.equal(receivedDocument.severity, null);
      assert.equal(receivedDocument.sourceKind, "IMAGE");
      assert.equal(receivedDocument.messageKo.startsWith("화재 발생"), true);
      assert.equal(proposalStore.size, 0);
    },
  );
});

test("만료되거나 확인되지 않은 이미지 제안은 처리하지 않는다", async () => {
  let called = false;
  await withServer(
    {
      workflow: {
        async runDocument() {
          called = true;
          return result();
        },
      },
      proposalStore: new Map(),
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/disasters/process-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: "missing",
            regionCode: "11530",
            startedAt: "2026-08-14T00:00:00Z",
            expectedEndAt: "2026-08-14T01:00:00Z",
          }),
        },
      );
      assert.equal(response.status, 410);
      assert.equal(called, false);
    },
  );
});

test("관리자 복구 요청은 Core 복구 워크플로 결과를 반환한다", async () => {
  let input;
  await withServer(
    {
      async reportRecovery(value) {
        input = value;
        return {
          outage: { id: "outage-1", status: "RECOVERY_REPORTED" },
          impactCases: [{ id: "case-1" }],
          statusChecks: [{ id: "check-1" }],
          transitions: [{ id: "case-1", status: "RECOVERY_CHECK" }],
          notificationFailures: [],
        };
      },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/outages/outage-1/recovery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recoveredAt: "2026-08-14T03:00:00Z" }),
        },
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.data.outageStatus, "RECOVERY_REPORTED");
      assert.equal(payload.data.recoveryChecksStarted, 1);
      assert.equal(payload.data.transitionedCases, 1);
      assert.equal(input.outageId, "outage-1");
    },
  );
});

test("PDF가 아닌 요청은 워크플로 실행 전에 거부한다", async () => {
  let called = false;
  await withServer(
    {
      async run() {
        called = true;
        return result();
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/disasters/process`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not pdf",
      });
      assert.equal(response.status, 415);
      assert.equal(called, false);
    },
  );
});
