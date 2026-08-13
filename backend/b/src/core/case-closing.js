import { ImpactCaseStatus } from "../contracts.js";

/**
 * Pure decision only — Backend 1 persists the actual ImpactCase/OutageEvent
 * transitions. Both household power and device must be confirmed normal.
 */
export function canCloseImpactCase({ recoveryConfirmation }) {
  return Boolean(
    recoveryConfirmation?.homePowerRestored === true &&
    recoveryConfirmation?.deviceOperatingNormally === true
  );
}

export function canCloseOutage({ caseSnapshots = [] }) {
  return caseSnapshots.length > 0 && caseSnapshots.every((item) => item.status === ImpactCaseStatus.CLOSED);
}
