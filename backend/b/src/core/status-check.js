import { randomUUID } from "node:crypto";
import { StatusCheckStatus } from "../contracts.js";

/**
 * A StatusCheck tracks one outstanding "please respond" request (patient status
 * or recovery confirmation). No response by the deadline is a TIMED_OUT
 * StatusCheck, never a PatientResponse value.
 */
export function createStatusCheck({ impactCaseId, purpose, now = new Date(), timeoutSeconds, idFactory = randomUUID }) {
  if (!(typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds >= 0)) {
    throw new TypeError("timeoutSeconds must be a non-negative finite number");
  }
  const requestedAt = new Date(now);
  return {
    id: idFactory(),
    impactCaseId,
    purpose,
    status: StatusCheckStatus.PENDING,
    requestedAt: requestedAt.toISOString(),
    timeoutAt: new Date(requestedAt.getTime() + timeoutSeconds * 1000).toISOString(),
    respondedAt: null,
    response: null,
  };
}

export function isStatusCheckDue(statusCheck, now = new Date()) {
  return (
    statusCheck.status === StatusCheckStatus.PENDING &&
    new Date(now).getTime() >= new Date(statusCheck.timeoutAt).getTime()
  );
}

export function respondToStatusCheck(statusCheck, response, now = new Date()) {
  if (statusCheck.status !== StatusCheckStatus.PENDING) {
    throw new Error(`STATUS_CHECK_NOT_PENDING:${statusCheck.status}`);
  }
  return {
    ...statusCheck,
    status: StatusCheckStatus.RESPONDED,
    response,
    respondedAt: new Date(now).toISOString(),
  };
}

export function timeoutStatusCheck(statusCheck, now = new Date()) {
  if (statusCheck.status !== StatusCheckStatus.PENDING) return statusCheck;
  if (!isStatusCheckDue(statusCheck, now)) {
    throw new Error("STATUS_CHECK_NOT_DUE");
  }
  return { ...statusCheck, status: StatusCheckStatus.TIMED_OUT, respondedAt: new Date(now).toISOString() };
}

export function cancelStatusCheck(statusCheck, now = new Date()) {
  if (statusCheck.status !== StatusCheckStatus.PENDING) return statusCheck;
  return { ...statusCheck, status: StatusCheckStatus.CANCELLED, respondedAt: new Date(now).toISOString() };
}
