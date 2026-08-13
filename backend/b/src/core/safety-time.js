const UNKNOWN = "UNKNOWN";
const KNOWN = "KNOWN";

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function toEpoch(value, fieldName) {
  const epoch = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(epoch)) throw new TypeError(`${fieldName} must be a valid date`);
  return epoch;
}

/**
 * 등록된 전원 프로필로부터 현재 남은 안전시간을 계산한다.
 * 실제 배터리 잔량 측정값이 아닌 등록 정보 기반 추정치다.
 */
export function calculateSafetyTime({
  batteryRuntimeMinutes,
  safetyBufferMinutes,
  verifiedBackupRuntimeMinutes = 0,
  outageStartedAt,
  now = new Date(),
}) {
  const missing = [];
  if (!finiteNonNegative(batteryRuntimeMinutes)) missing.push("batteryRuntimeMinutes");
  if (!finiteNonNegative(safetyBufferMinutes)) missing.push("safetyBufferMinutes");
  if (!finiteNonNegative(verifiedBackupRuntimeMinutes)) missing.push("verifiedBackupRuntimeMinutes");

  if (missing.length > 0) {
    return {
      status: UNKNOWN,
      effectiveRuntimeMinutes: null,
      elapsedMinutes: null,
      remainingMinutes: null,
      remainingRatio: null,
      reason: `Missing or invalid input: ${missing.join(", ")}`,
    };
  }

  let startedAt;
  let current;
  try {
    startedAt = toEpoch(outageStartedAt, "outageStartedAt");
    current = toEpoch(now, "now");
  } catch (error) {
    return {
      status: UNKNOWN,
      effectiveRuntimeMinutes: null,
      elapsedMinutes: null,
      remainingMinutes: null,
      remainingRatio: null,
      reason: error.message,
    };
  }

  const effectiveRuntimeMinutes = Math.max(
    0,
    batteryRuntimeMinutes + verifiedBackupRuntimeMinutes - safetyBufferMinutes,
  );
  const elapsedMinutes = Math.max(0, (current - startedAt) / 60_000);
  const remainingMinutes = Math.max(0, effectiveRuntimeMinutes - elapsedMinutes);

  return {
    status: KNOWN,
    effectiveRuntimeMinutes,
    elapsedMinutes,
    remainingMinutes,
    // 0 when effectiveRuntimeMinutes is 0 too, so ratio-based policy resolves it as CRITICAL, not NaN.
    remainingRatio: effectiveRuntimeMinutes > 0 ? remainingMinutes / effectiveRuntimeMinutes : 0,
    reason: null,
  };
}

export function calculatePlannedOutageShortfall({
  batteryRuntimeMinutes,
  safetyBufferMinutes,
  verifiedBackupRuntimeMinutes = 0,
  scheduledStartAt,
  scheduledEndAt,
}) {
  if (
    !finiteNonNegative(batteryRuntimeMinutes) ||
    !finiteNonNegative(safetyBufferMinutes) ||
    !finiteNonNegative(verifiedBackupRuntimeMinutes)
  ) {
    return { status: UNKNOWN, expectedOutageMinutes: null, shortfallMinutes: null };
  }

  try {
    const start = toEpoch(scheduledStartAt, "scheduledStartAt");
    const end = toEpoch(scheduledEndAt, "scheduledEndAt");
    if (end < start) throw new TypeError("scheduledEndAt must not be before scheduledStartAt");
    const expectedOutageMinutes = (end - start) / 60_000;
    const effectiveRuntimeMinutes = Math.max(
      0,
      batteryRuntimeMinutes + verifiedBackupRuntimeMinutes - safetyBufferMinutes,
    );
    return {
      status: KNOWN,
      expectedOutageMinutes,
      effectiveRuntimeMinutes,
      shortfallMinutes: Math.max(0, expectedOutageMinutes - effectiveRuntimeMinutes),
    };
  } catch (error) {
    return {
      status: UNKNOWN,
      expectedOutageMinutes: null,
      effectiveRuntimeMinutes: null,
      shortfallMinutes: null,
      reason: error.message,
    };
  }
}

export const SafetyTimeStatus = Object.freeze({ KNOWN, UNKNOWN });
