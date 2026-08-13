import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileJobQueue, JobType } from "../src/index.js";

test("파일 작업 큐는 재시작 뒤에도 알람 일정과 중복 방지 키를 유지한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "chic-job-queue-"));
  const filePath = join(directory, "jobs.json");
  try {
    const first = new FileJobQueue({ filePath });
    const scheduled = first.schedule({
      type: JobType.STATUS_CHECK_TIMEOUT,
      runAt: "2026-08-14T00:00:10Z",
      payload: { statusCheckId: "check-1" },
      idempotencyKey: "status-check:check-1",
    });
    assert.equal(scheduled.duplicate, false);

    const restarted = new FileJobQueue({ filePath });
    const duplicate = restarted.schedule({
      type: JobType.STATUS_CHECK_TIMEOUT,
      runAt: "2026-08-14T00:00:10Z",
      payload: { statusCheckId: "check-1" },
      idempotencyKey: "status-check:check-1",
    });
    assert.equal(duplicate.duplicate, true);

    const handled = [];
    const results = await restarted.runDue({
      now: "2026-08-14T00:00:11Z",
      handlers: {
        [JobType.STATUS_CHECK_TIMEOUT]: async (payload) =>
          handled.push(payload.statusCheckId),
      },
    });
    assert.deepEqual(handled, ["check-1"]);
    assert.equal(results[0].job.status, "COMPLETED");

    const afterWorkerRestart = new FileJobQueue({ filePath });
    assert.equal(
      afterWorkerRestart.jobs.get(results[0].job.id).status,
      "COMPLETED",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
