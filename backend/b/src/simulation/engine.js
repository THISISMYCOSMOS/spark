import { randomUUID } from "node:crypto";
import { ImpactCaseStatus, Mode, OutageStatus } from "../contracts.js";
import { createImpactCases } from "../core/matching.js";
import { calculateSafetyTime } from "../core/safety-time.js";
import { evaluateRisk } from "../core/risk.js";

/**
 * TEST-only virtual-time simulation. Recalculates safety time and risk as
 * time advances. Never touches LIVE data or a real SMS provider — it has no
 * notification dependency at all.
 */
export class SimulationEngine {
  constructor({ patients = [], startAt = new Date(), riskPolicy } = {}) {
    this.patients = structuredClone(patients);
    this.currentTime = new Date(startAt);
    this.riskPolicy = riskPolicy;
    this.outages = new Map();
    this.impactCases = new Map();
  }

  startOutage(input) {
    if (input.mode && input.mode !== Mode.TEST) throw new Error("SIMULATION_REQUIRES_TEST_MODE");
    const outage = {
      ...structuredClone(input),
      id: input.id ?? randomUUID(),
      mode: Mode.TEST,
      status: OutageStatus.ACTIVE,
      startedAt: input.startedAt ?? this.currentTime.toISOString(),
    };
    this.outages.set(outage.id, outage);
    const result = createImpactCases({
      outage,
      patients: this.patients,
      existingCases: [...this.impactCases.values()],
      now: this.currentTime,
      riskPolicy: this.riskPolicy,
    });
    for (const item of result.created) this.impactCases.set(item.id, item);
    return { outage: structuredClone(outage), ...structuredClone(result) };
  }

  advanceTime(minutes) {
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
      throw new TypeError("minutes must be a non-negative finite number");
    }
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60_000);
    this.#recalculate();
    return this.snapshot();
  }

  reportRecovery(outageId) {
    const outage = this.outages.get(outageId);
    if (!outage) throw new Error("OUTAGE_NOT_FOUND");
    outage.status = OutageStatus.RECOVERY_REPORTED;
    outage.recoveryReportedAt = this.currentTime.toISOString();
    for (const item of this.#casesFor(outageId)) {
      // Workflow status changes; risk is preserved (v0.1 #4) — never overwritten here.
      item.status = ImpactCaseStatus.RECOVERY_CHECK;
      item.updatedAt = this.currentTime.toISOString();
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone({
      mode: Mode.TEST,
      currentTime: this.currentTime.toISOString(),
      outages: [...this.outages.values()],
      impactCases: [...this.impactCases.values()],
    });
  }

  #casesFor(outageId) {
    return [...this.impactCases.values()].filter((item) => item.outageId === outageId);
  }

  #recalculate() {
    for (const impactCase of this.impactCases.values()) {
      const outage = this.outages.get(impactCase.outageId);
      if (!outage || outage.status !== OutageStatus.ACTIVE) continue;
      const patient = this.patients.find((item) => item.id === impactCase.patientId);
      const profile = patient?.powerProfile ?? {};
      impactCase.safetyTime = calculateSafetyTime({
        batteryRuntimeMinutes: profile.batteryRuntimeMinutes,
        safetyBufferMinutes: profile.safetyBufferMinutes,
        verifiedBackupRuntimeMinutes: profile.verifiedBackupRuntimeMinutes ?? 0,
        outageStartedAt: outage.startedAt,
        now: this.currentTime,
      });
      const risk = evaluateRisk({
        safetyTime: impactCase.safetyTime,
        response: impactCase.response,
        policy: this.riskPolicy,
      });
      impactCase.riskLevel = risk.level;
      impactCase.riskReason = risk.reason;
      impactCase.updatedAt = this.currentTime.toISOString();
    }
  }
}
