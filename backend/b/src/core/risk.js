import { PatientResponse, RiskLevel } from "../contracts.js";
import { SafetyTimeStatus } from "./safety-time.js";

// DEMO_ONLY: not confirmed by product/medical stakeholders. Replace before any real decision use.
// Versioned so a later approved policy can be swapped in without touching callers.
export const DEMO_ONLY_RISK_POLICY = Object.freeze({
  policyId: "DEMO_ONLY",
  version: 1,
  responseTimeoutSeconds: 10,
  // ratio > watchRatioThreshold => WATCH
  watchRatioThreshold: 0.5,
  // criticalRatioThreshold < ratio <= watchRatioThreshold => HIGH; ratio <= criticalRatioThreshold => CRITICAL
  criticalRatioThreshold: 0.2,
});

/**
 * Pure risk grading. Independent of ImpactCaseStatus/workflow (v0.1 #1) and of
 * OutageStatus — regional recovery must never call this to overwrite a prior risk (v0.1 #4).
 */
export function evaluateRisk({
  safetyTime,
  response = null,
  statusCheckTimedOut = false,
  allGuardiansUnavailable = false,
  policy = DEMO_ONLY_RISK_POLICY,
}) {
  const policyId = policy.policyId;
  const policyVersion = policy.version;

  if (response === PatientResponse.NEED_HELP) {
    return { level: RiskLevel.CRITICAL, reason: "PATIENT_NEEDS_HELP", policyId, policyVersion };
  }
  if (response === PatientResponse.EQUIPMENT_ISSUE) {
    return { level: RiskLevel.CRITICAL, reason: "EQUIPMENT_ISSUE", policyId, policyVersion };
  }
  if (allGuardiansUnavailable) {
    return { level: RiskLevel.CRITICAL, reason: "ALL_GUARDIANS_UNAVAILABLE", policyId, policyVersion };
  }
  // Missing/invalid safety input is never assumed safe: at least HIGH, never WATCH.
  if (!safetyTime || safetyTime.status !== SafetyTimeStatus.KNOWN) {
    return { level: RiskLevel.HIGH, reason: "SAFETY_TIME_UNKNOWN", policyId, policyVersion };
  }
  if (safetyTime.effectiveRuntimeMinutes === 0 || safetyTime.remainingMinutes === 0) {
    return { level: RiskLevel.CRITICAL, reason: "NO_REMAINING_SAFETY_TIME", policyId, policyVersion };
  }

  const ratio = safetyTime.remainingRatio;
  let level;
  let reason;
  if (ratio > policy.watchRatioThreshold) {
    level = RiskLevel.WATCH;
    reason = "REMAINING_RATIO_ABOVE_WATCH_THRESHOLD";
  } else if (ratio > policy.criticalRatioThreshold) {
    level = RiskLevel.HIGH;
    reason = "REMAINING_RATIO_AT_OR_BELOW_WATCH_THRESHOLD";
  } else {
    level = RiskLevel.CRITICAL;
    reason = "REMAINING_RATIO_AT_OR_BELOW_CRITICAL_THRESHOLD";
  }

  // A timed-out StatusCheck (no response) never leaves risk at WATCH.
  if (statusCheckTimedOut && level === RiskLevel.WATCH) {
    level = RiskLevel.HIGH;
    reason = "STATUS_CHECK_TIMED_OUT";
  }

  return { level, reason, policyId, policyVersion };
}
