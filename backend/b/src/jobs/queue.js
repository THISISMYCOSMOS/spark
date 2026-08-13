import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export class InMemoryJobQueue {
  constructor() {
    this.jobs = new Map();
    this.byKey = new Map();
  }

  schedule({ type, runAt, payload, idempotencyKey }) {
    const existingId = this.byKey.get(idempotencyKey);
    if (existingId) return { duplicate: true, job: this.jobs.get(existingId) };
    const job = {
      id: randomUUID(),
      type,
      runAt: new Date(runAt).toISOString(),
      payload,
      idempotencyKey,
      status: "SCHEDULED",
      attempts: 0,
      lastError: null,
    };
    this.jobs.set(job.id, job);
    this.byKey.set(idempotencyKey, job.id);
    return { duplicate: false, job };
  }

  async runDue({ now = new Date(), handlers }) {
    const due = [...this.jobs.values()].filter(
      (job) =>
        job.status === "SCHEDULED" &&
        new Date(job.runAt).getTime() <= new Date(now).getTime(),
    );
    const results = [];
    for (const job of due) {
      job.attempts += 1;
      try {
        const handler = handlers[job.type];
        if (!handler) throw new Error(`No handler for job type ${job.type}`);
        await handler(job.payload, job);
        job.status = "COMPLETED";
        results.push({ job, ok: true });
      } catch (error) {
        job.status = "SCHEDULED";
        job.lastError =
          typeof error?.code === "string" && /^[A-Z0-9_:-]+$/.test(error.code)
            ? error.code
            : "JOB_HANDLER_FAILED";
        results.push({ job, ok: false });
      }
    }
    return results;
  }
}

/** Small-process durable queue. The configured directory must be backed by a
 * persistent volume in production. It preserves schedules across restarts;
 * workers still own when and how runDue() is invoked. */
export class FileJobQueue extends InMemoryJobQueue {
  constructor({ filePath }) {
    super();
    if (typeof filePath !== "string" || filePath.trim() === "") {
      throw new TypeError("filePath is required");
    }
    this.filePath = filePath;
    this.#load();
  }

  schedule(input) {
    const result = super.schedule(input);
    if (!result.duplicate) this.#persist();
    return result;
  }

  async runDue(input) {
    const results = await super.runDue(input);
    if (results.length > 0) this.#persist();
    return results;
  }

  #load() {
    if (!existsSync(this.filePath)) return;
    let saved;
    try {
      saved = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch {
      throw new Error("PERSISTENT_JOB_QUEUE_INVALID");
    }
    if (!Array.isArray(saved)) throw new Error("PERSISTENT_JOB_QUEUE_INVALID");
    for (const job of saved) {
      if (!job?.id || !job?.idempotencyKey || !job?.type || !job?.runAt) {
        throw new Error("PERSISTENT_JOB_QUEUE_INVALID");
      }
      this.jobs.set(job.id, job);
      this.byKey.set(job.idempotencyKey, job.id);
    }
  }

  #persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify([...this.jobs.values()]), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, this.filePath);
  }
}

export const JobType = Object.freeze({
  STATUS_CHECK_TIMEOUT: "STATUS_CHECK_TIMEOUT",
  RECOVERY_TIMEOUT: "RECOVERY_TIMEOUT",
  NOTIFICATION_RETRY: "NOTIFICATION_RETRY",
});
