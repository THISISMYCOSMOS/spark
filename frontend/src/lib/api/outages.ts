import { apiRequest, getPatientId } from "@/lib/api/client";
import type {
  CurrentImpactCaseView,
  PatientResponseView,
  PublicCheckInResponseView,
  UserRole,
} from "@/lib/api/types";

export async function getCurrentImpactCase(role: UserRole) {
  const patientId = getPatientId(role);
  if (!patientId) return null;
  return apiRequest<CurrentImpactCaseView>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/current-impact-case`,
    { method: "GET", role },
  );
}

export function submitPublicCheckInResponse(
  token: string,
  body:
    | {
        response_type: "NORMAL" | "NEED_HELP" | "EQUIPMENT_ISSUE";
        note: string | null;
      }
    | {
        home_power_restored: boolean;
        device_operating_normally: boolean;
        note: string | null;
      },
) {
  return apiRequest<PublicCheckInResponseView>(
    `/api/v1/public/check-ins/${encodeURIComponent(token)}/responses`,
    { method: "POST", body },
  );
}

export async function submitPatientResponse(
  impactCaseId: string,
  responseType: "NORMAL" | "NEED_HELP" | "EQUIPMENT_ISSUE",
  note: string | null,
) {
  return apiRequest<PatientResponseView>(
    `/api/v1/impact-cases/${encodeURIComponent(impactCaseId)}/patient-responses`,
    {
      method: "POST",
      role: "PATIENT",
      idempotencyKey: `patient-response:${impactCaseId}:${responseType}`,
      body: { response_type: responseType, note },
    },
  );
}
