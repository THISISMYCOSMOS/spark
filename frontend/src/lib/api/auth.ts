import { apiRequest, storeAccessToken, storePatientId } from "@/lib/api/client";
import type { AuthView } from "@/lib/api/types";

export interface GuardianSignupRequest {
  guardian_name: string;
  guardian_phone: string;
  password: string;
  patient_name: string;
  patient_phone: string;
  secondary_phone: string | null;
  affiliated_institution: string;
  patient_address: string;
  diagnosis: string;
  electronic_devices: string[];
}

export async function signupGuardian(body: GuardianSignupRequest) {
  const result = await apiRequest<AuthView>("/api/v1/auth/guardians/signup", {
    method: "POST",
    body,
  });
  storeAccessToken("GUARDIAN", result.token.accessToken);
  if (result.patients?.[0]) storePatientId("GUARDIAN", result.patients[0].id);
  return result;
}

export async function loginPatient(guardianCode: string) {
  const result = await apiRequest<AuthView>("/api/v1/auth/patients/login", {
    method: "POST",
    body: { guardian_code: guardianCode },
  });
  storeAccessToken("PATIENT", result.token.accessToken);
  if (result.patient) storePatientId("PATIENT", result.patient.id);
  return result;
}
