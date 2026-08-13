import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { GeminiDisasterImageRecognizer } from "../src/index.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  throw new Error("Provide one or more public disaster-alert image paths");
}

const mimeTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
]);

const recognizer = new GeminiDisasterImageRecognizer();
for (const path of paths) {
  const mimeType = mimeTypes.get(extname(path).toLowerCase());
  if (!mimeType) throw new Error("Only JPEG and PNG disaster-alert images are supported");
  try {
    const result = await recognizer.recognize({ imageBytes: await readFile(path), mimeType });
    process.stdout.write(`${JSON.stringify({
      file: basename(path),
      ok: true,
      disasterType: result.disasterType,
      recognizedText: result.recognizedText,
      guidanceItemsKo: result.guidanceItemsKo,
      status: result.status,
      reviewRequired: result.reviewRequired,
      model: result.model,
      requestId: result.requestId,
    })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      file: basename(path),
      ok: false,
      errorCode: typeof error?.code === "string" ? error.code : "IMAGE_RECOGNITION_FAILED",
    })}\n`);
  }
}
