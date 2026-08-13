import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ingestMockDisasterPdf, parseMockDisasterPdf } from "../src/index.js";

const fixtures = [
  ["mock-disaster-alert-typhoon.pdf", "TYPHOON", "99001"],
  ["mock-disaster-alert-earthquake.pdf", "EARTHQUAKE", "99002"],
  ["mock-disaster-alert-cold-wave.pdf", "COLD_WAVE", "99003"],
  ["mock-disaster-alert-fire.pdf", "FIRE", "99004"],
];

function fixturePath(filename) {
  return fileURLToPath(new URL(`../output/pdf/${filename}`, import.meta.url));
}

for (const [filename, disasterType, regionCode] of fixtures) {
  test(`${filename}을 읽어 TEST ACTIVE 재난으로 검증한다`, async () => {
    const document = await parseMockDisasterPdf(await readFile(fixturePath(filename)));
    assert.equal(document.documentType, "MOCK_DISASTER_ALERT_V1");
    assert.equal(document.disasterType, disasterType);
    assert.equal(document.regionCode, regionCode);
    assert.equal(document.mode, "TEST");
    assert.equal(document.status, "ACTIVE");
    assert.match(document.titleKo, /^\[목업\]/);
    assert.equal(document.documentSha256.length, 64);
    assert.ok(document.officialGuidanceCodes.length >= 3);
  });
}

test("검증된 PDF만 백엔드 1 ACTIVE 전환 포트로 전달한다", async () => {
  let captured;
  const pdfBytes = await readFile(fixturePath("mock-disaster-alert-fire.pdf"));
  const result = await ingestMockDisasterPdf({
    pdfBytes,
    activationPort: {
      async activateDisaster(command) {
        captured = command;
        return { ok: true, data: { transitionId: "transition-1" } };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(captured.type, "ACTIVATE_DISASTER");
  assert.equal(captured.outage.status, "ACTIVE");
  assert.equal(captured.outage.mode, "TEST");
  assert.equal(captured.outage.disasterType, "FIRE");
  assert.match(captured.outage.sourceMessage, /즉시 대피/);
  assert.match(captured.idempotencyKey, /^MOCK_PDF:MOCK-FIRE-20260814-001:[a-f0-9]{64}$/);
  assert.equal(result.data.activation.transitionId, "transition-1");
});

test("PDF가 아닌 업로드는 전환 포트를 호출하지 않고 거부한다", async () => {
  let called = false;
  const result = await ingestMockDisasterPdf({
    pdfBytes: Buffer.from("not a pdf"),
    activationPort: {
      async activateDisaster() {
        called = true;
        return { ok: true };
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INVALID_MOCK_DISASTER_PDF");
  assert.equal(called, false);
});
