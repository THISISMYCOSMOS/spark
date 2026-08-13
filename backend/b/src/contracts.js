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
  ACCEPTED: "ACCEPTED",
  // Backward-compatible alias. Provider acceptance is not final handset delivery.
  SENT: "ACCEPTED",
  FAILED: "FAILED",
});

export const NotificationErrorCode = Object.freeze({
  CONFIG_MISSING: "SOLAPI_CONFIG_MISSING",
  AUTHENTICATION_FAILED: "SOLAPI_AUTHENTICATION_FAILED",
  NETWORK_ERROR: "SOLAPI_NETWORK_ERROR",
  RATE_LIMITED: "SOLAPI_RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "SOLAPI_PROVIDER_UNAVAILABLE",
  INVALID_RECIPIENT: "SOLAPI_INVALID_RECIPIENT",
  INVALID_REQUEST: "SOLAPI_INVALID_REQUEST",
  PROVIDER_REJECTED: "SOLAPI_PROVIDER_REJECTED",
  INVALID_RESPONSE: "SOLAPI_INVALID_RESPONSE",
  UNEXPECTED_ERROR: "SOLAPI_UNEXPECTED_ERROR",
});

export function portSuccess(data = {}) {
  return { ok: true, data };
}

export function portFailure(errorCode, retryable = false) {
  if (!errorCode) throw new TypeError("errorCode is required");
  return { ok: false, errorCode, retryable: Boolean(retryable) };
}

// Runtime port shapes for Backend 1 adapters. These define behavior only;
// Backend 2 never implements a production database, token store, or HTTP API.
export class ResponseTokenPort {
  async reserveLink() {
    throw new Error("RESPONSE_TOKEN_PORT_NOT_IMPLEMENTED");
  }

  async activateLink() {
    throw new Error("RESPONSE_TOKEN_PORT_NOT_IMPLEMENTED");
  }
}

export class NotificationResultPort {
  async recordNotificationResult() {
    throw new Error("NOTIFICATION_RESULT_PORT_NOT_IMPLEMENTED");
  }
}

export class StatusCheckCommandPort {
  async createStatusCheck() {
    throw new Error("STATUS_CHECK_COMMAND_PORT_NOT_IMPLEMENTED");
  }
}

export class GuardianStatusSnapshotPort {
  async getGuardianStatusSnapshot() {
    throw new Error("GUARDIAN_STATUS_SNAPSHOT_PORT_NOT_IMPLEMENTED");
  }
}

export class RecoveryCheckSnapshotPort {
  async getRecoveryCheckSnapshot() {
    throw new Error("RECOVERY_CHECK_SNAPSHOT_PORT_NOT_IMPLEMENTED");
  }
}

export function assertOneOf(value, values, fieldName) {
  if (!Object.values(values).includes(value)) {
    throw new TypeError(`${fieldName} must be one of: ${Object.values(values).join(", ")}`);
  }
}
