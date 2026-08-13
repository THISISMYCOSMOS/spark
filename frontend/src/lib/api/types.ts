export type ApiMode = "mock" | "real";
export type UserRole = "GUARDIAN" | "PATIENT";

export interface ApiErrorData {
  code: string;
  message: string;
  details: Record<string, unknown> | unknown[];
}

export interface ApiEnvelope<T> {
  data: T | null;
  meta: { timestamp: string };
  error: ApiErrorData | null;
}

export interface TokenView {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface GuardianView {
  id: string;
  name: string;
  phone: string;
}

export interface PatientView {
  id: string;
  name: string;
  phone: string;
  secondaryPhone: string | null;
  affiliatedInstitution: string | null;
  address: string;
  diagnosis: string;
  electronicDevices: string[];
}

export interface AuthView {
  role: UserRole;
  token: TokenView;
  guardian?: GuardianView;
  patient?: PatientView;
  patients?: PatientView[];
  guardianCode?: string;
}

export interface MedicalDeviceInput {
  device_type: string;
  model_name: string | null;
  battery_runtime_minutes: number | null;
  runtime_verified: boolean;
  is_essential: boolean;
}

export interface EmergencyContactInput {
  name: string;
  phone: string;
  relationship: string;
  priority: number;
}

export interface PatientWriteRequest {
  name: string;
  phone: string;
  secondary_phone: string | null;
  affiliated_institution: string;
  address: string;
  address_detail: string | null;
  region_code: string;
  diagnosis: string;
  power_profile: {
    safety_margin_minutes: number;
    backup_power_runtime_minutes: number;
    backup_power_verified: boolean;
    devices: MedicalDeviceInput[];
  };
  emergency_contacts: EmergencyContactInput[];
  version: number;
  change_reason: string;
}

export interface PatientDetail extends PatientView {
  addressDetail: string | null;
  regionCode: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  emergencyContacts: EmergencyContactView[];
}

export interface EmergencyContactView {
  id: string;
  guardianId: string | null;
  name: string;
  phone: string;
  relationship: string | null;
  priority: number;
  isActive: boolean;
}

export interface AiResponsePlanAction {
  code: string;
  instructionKo: string;
}

export interface AiResponsePlanView {
  status: "PROPOSED";
  reviewRequired: true;
  policyVersion: string;
  actions: AiResponsePlanAction[];
  narrative: string;
  narrativeSource: "AI" | "RULE_FALLBACK";
  model: string | null;
  requestId: string | null;
  fallbackReason: string | null;
}

export interface CurrentImpactCaseView {
  outage: {
    id: string;
    title: string;
    status: "SCHEDULED" | "ACTIVE" | "RECOVERY_REPORTED" | "CLOSED" | "CANCELLED";
    regionCodes: string[];
    scheduledStartAt: string | null;
    expectedEndAt: string | null;
    startedAt: string | null;
  };
  impactCase: {
    id: string;
    patientId: string;
    status: string;
    effectiveRuntimeMinutes: number | null;
    responseDueAt: string | null;
    responsePlan: AiResponsePlanView | null;
    responsePlanUpdatedAt: string | null;
    createdAt: string;
  };
  patientResponse: {
    responseType: "NORMAL" | "NEED_HELP" | "EQUIPMENT_ISSUE";
    note: string | null;
    respondedAt: string;
  } | null;
}

export interface PatientResponseView {
  statusCheckId: string;
  purpose: "OUTAGE_STATUS";
  responseType: "NORMAL" | "NEED_HELP" | "EQUIPMENT_ISSUE";
  acceptedAt: string;
}

export interface PublicCheckInResponseView {
  statusCheckId: string;
  purpose: "OUTAGE_STATUS" | "RECOVERY_CONFIRMATION";
  responseType?: "NORMAL" | "NEED_HELP" | "EQUIPMENT_ISSUE";
  homePowerRestored?: boolean;
  deviceOperatingNormally?: boolean;
  caseClosed?: boolean;
  decisionPending?: boolean;
  acceptedAt: string;
}

export interface GuardianActionView {
  id: string;
  impactCaseId: string;
  emergencyContactId: string;
  guardianId: string | null;
  status: "CONTACTED" | "ACTING" | "UNAVAILABLE" | "COMPLETED";
  escalationRound: number;
  note: string | null;
  actedAt: string;
}

export interface RecoveryConfirmationView {
  id: string;
  impactCaseId: string;
  homePowerRestored: boolean;
  deviceOperatingNormally: boolean;
  confirmedById: string;
  confirmedByRole: "GUARDIAN" | "PATIENT" | "INSTITUTION_ADMIN";
  reason: string;
  confirmedAt: string;
  caseClosed: false;
  decisionPending: true;
}
