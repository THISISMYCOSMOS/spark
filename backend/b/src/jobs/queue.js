import { randomUUID } from "node:crypto";

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
      (job) => job.status === "SCHEDULED" && new Date(job.runAt).getTime() <= new Date(now).getTime(),
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
        job.lastError = error.message;
        results.push({ job, ok: false });
      }
    }
    return results;
  }
}

export const JobType = Object.freeze({
  STATUS_CHECK_TIMEOUT: "STATUS_CHECK_TIMEOUT",
  RECOVERY_TIMEOUT: "RECOVERY_TIMEOUT",
  NOTIFICATION_RETRY: "NOTIFICATION_RETRY",
});
