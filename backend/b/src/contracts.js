export const Mode = Object.freeze({ TEST: "TEST", LIVE: "LIVE" });

export const OutageStatus = Object.freeze({
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  RECOVERY_REPORTED: "RECOVERY_REPORTED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
});

// Workflow state only. Independent from RiskLevel by design (v0.1 #1).
export const ImpactCaseStatus = Object.freeze({
  PREPARE: "PREPARE",
  WAITING_PATIENT: "WAITING_PATIENT",
  MONITORING: "MONITORING",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  GUARDIAN_ACTING: "GUARDIAN_ACTING",
  RECOVERY_CHECK: "RECOVERY_CHECK",
  CLOSED: "CLOSED",
});

// Risk grading only. Never mixed with workflow status.
export const RiskLevel = Object.freeze({
  WATCH: "WATCH",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

export const PatientResponse = Object.freeze({
  NORMAL: "NORMAL",
  EQUIPMENT_ISSUE: "EQUIPMENT_ISSUE",
  NEED_HELP: "NEED_HELP",
});

// A missing response is a timed-out StatusCheck, never a PatientResponse value.
export const StatusCheckStatus = Object.freeze({
  PENDING: "PENDING",
  RESPONDED: "RESPONDED",
  TIMED_OUT: "TIMED_OUT",
  CANCELLED: "CANCELLED",
});

export const DeliveryStatus = Object.freeze({
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
});

export function assertOneOf(value, values, fieldName) {
  if (!Object.values(values).includes(value)) {
    throw new TypeError(`${fieldName} must be one of: ${Object.values(values).join(", ")}`);
  }
}
