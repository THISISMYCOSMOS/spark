import test from "node:test";
import assert from "node:assert/strict";

import {
  GeminiClientError,
  GeminiDisasterImageRecognizer,
  classifyRecognizedDisasterText,
  extractRecognizedGuidanceItems,
  validateDisasterAlertImage,
} from "../src/index.js";

const mockAlerts = Object.freeze([
  {
    disasterType: "COLD_WAVE",
    text: "한파주의보 지속중 ▲보온 및 방한 철저 ▲야외활동 자제 ▲도로결빙에 따른 안전운전 ▲계량기 동파 예방 ▲난방기 화재 주의 등 안전에 유의바랍니다",
  },
  {
    disasterType: "EARTHQUAKE",
    text: "지진 발생에 주의바랍니다 ▲낙하물 및 유리창 주변 주의 ▲책상 아래 등 안전한 곳으로 대피 ▲엘리베이터 사용 자제 ▲가스·전기 차단 확인 ▲여진 발생 가능성에 대비하시기 바랍니다",
  },
  {
    disasterType: "TYPHOON",
    text: "태풍 영향 지속중 ▲외출 및 야외활동 자제 ▲창문·간판 등 시설물 점검 ▲하천·해안가 접근 금지 ▲침수 위험지역 이동 자제 ▲강풍 및 낙하물 피해에 유의바랍니다",
  },
  {
    disasterType: "FIRE",
    text: "화재 발생에 주의바랍니다 ▲연기 발생 시 낮은 자세로 이동 ▲엘리베이터 사용 금지 ▲신속히 안전한 장소로 대피 ▲가스·전기 차단 ▲주변 인화성 물질 및 추가 화재 위험에 유의바랍니다",
  },
]);

function fakeJpegBytes() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function fakeSdk(response, captured) {
  return {
    models: {
      async generateContent(request) {
        captured.push(request);
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
}

for (const alert of mockAlerts) {
  test(`${alert.disasterType} 재난문자 OCR 결과를 유형과 검증된 행동코드로 변환한다`, async () => {
    const captured = [];
    const recognizer = new GeminiDisasterImageRecognizer({
      apiKey: "test-api-key",
      model: "test-gemini-model",
      sdkClient: fakeSdk({
        text: JSON.stringify({ recognizedText: alert.text }),
        modelVersion: "test-model-version",
        responseId: `request-${alert.disasterType}`,
      }, captured),
    });

    const result = await recognizer.recognize({ imageBytes: fakeJpegBytes(), mimeType: "image/jpeg" });

    assert.equal(result.disasterType, alert.disasterType);
    assert.equal(result.recognizedText, alert.text);
    assert.equal(result.status, "PROPOSED");
    assert.equal(result.reviewRequired, true);
    assert.equal(result.source, "GEMINI_VISION_OCR");
    assert.ok(result.officialGuidanceCodes.length >= 3);
    assert.ok(result.guidanceItemsKo.length >= 4);
    assert.equal(result.imageSha256.length, 64);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].model, "test-gemini-model");
    assert.equal(captured[0].contents[0].inlineData.mimeType, "image/jpeg");
    assert.equal(captured[0].config.responseMimeType, "application/json");
    assert.deepEqual(captured[0].config.responseJsonSchema.required, ["recognizedText"]);
    assert.equal(captured[0].config.thinkingConfig.thinkingLevel, "LOW");
  });
}

test("헤더 재난 유형을 우선하여 본문에 다른 위험 단어가 있어도 오분류하지 않는다", () => {
  assert.equal(classifyRecognizedDisasterText(mockAlerts[0].text), "COLD_WAVE");
  assert.deepEqual(extractRecognizedGuidanceItems(mockAlerts[0].text).slice(0, 2), ["보온 및 방한 철저", "야외활동 자제"]);
});

test("지원하지 않는 형식과 위조된 이미지 시그니처는 Gemini 호출 전에 거부한다", () => {
  assert.throws(() => validateDisasterAlertImage(fakeJpegBytes(), "image/gif"), /Unsupported/);
  assert.throws(() => validateDisasterAlertImage(Buffer.from("not-jpeg"), "image/jpeg"), /MIME type/);
});

test("모호한 OCR 결과와 잘못된 JSON은 안전한 오류 코드로 거부한다", async () => {
  const ambiguous = new GeminiDisasterImageRecognizer({
    apiKey: "test-api-key",
    model: "test-gemini-model",
    sdkClient: fakeSdk({ text: JSON.stringify({ recognizedText: "재난 발생에 주의하고 안전한 장소로 대피하시기 바랍니다" }) }, []),
  });
  await assert.rejects(
    ambiguous.recognize({ imageBytes: fakeJpegBytes(), mimeType: "image/jpeg" }),
    (error) => error instanceof GeminiClientError && error.code === "GEMINI_INVALID_DISASTER_IMAGE_OUTPUT",
  );

  const invalidJson = new GeminiDisasterImageRecognizer({
    apiKey: "test-api-key",
    model: "test-gemini-model",
    sdkClient: fakeSdk({ text: "not-json" }, []),
  });
  await assert.rejects(
    invalidJson.recognize({ imageBytes: fakeJpegBytes(), mimeType: "image/jpeg" }),
    (error) => error instanceof GeminiClientError && error.code === "GEMINI_INVALID_JSON",
  );
});

test("SDK 오류 원문에 비밀값이 있어도 외부 오류에는 노출하지 않는다", async () => {
  const secret = "do-not-expose-this-key";
  const recognizer = new GeminiDisasterImageRecognizer({
    apiKey: secret,
    model: "test-gemini-model",
    sdkClient: fakeSdk(new Error(`${secret} private-image-data`), []),
  });
  await assert.rejects(
    recognizer.recognize({ imageBytes: fakeJpegBytes(), mimeType: "image/jpeg" }),
    (error) => {
      assert.equal(error instanceof GeminiClientError, true);
      assert.equal(error.code, "GEMINI_REQUEST_FAILED");
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.stack.includes(secret), false);
      return true;
    },
  );
});

test("Gemini 할당량 오류는 원문 없이 안전한 코드로 구분한다", async () => {
  const rateLimitError = new Error("provider detail must not escape");
  rateLimitError.status = 429;
  const recognizer = new GeminiDisasterImageRecognizer({
    apiKey: "test-api-key",
    model: "test-gemini-model",
    sdkClient: fakeSdk(rateLimitError, []),
  });

  await assert.rejects(
    recognizer.recognize({ imageBytes: fakeJpegBytes(), mimeType: "image/jpeg" }),
    (error) => {
      assert.equal(error instanceof GeminiClientError, true);
      assert.equal(error.code, "GEMINI_RATE_LIMITED");
      assert.equal(error.message.includes("provider detail"), false);
      return true;
    },
  );
});
