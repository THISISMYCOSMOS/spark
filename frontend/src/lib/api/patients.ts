import { apiRequest } from "@/lib/api/client";
import type { PatientDetail, PatientWriteRequest } from "@/lib/api/types";

export function getPatient(patientId: string) {
  return apiRequest<PatientDetail>(`/api/v1/patients/${encodeURIComponent(patientId)}`, {
    method: "GET",
    role: "GUARDIAN",
  });
}

export function updatePatient(patientId: string, body: PatientWriteRequest) {
  return apiRequest<PatientDetail>(`/api/v1/patients/${encodeURIComponent(patientId)}`, {
    method: "PUT",
    role: "GUARDIAN",
    body,
  });
}
