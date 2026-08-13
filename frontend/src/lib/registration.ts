import {
  DEVICE_OPTIONS,
  DISEASE_OPTIONS,
  type GuardianContextValue,
} from "@/contexts/GuardianContext";
import { signupGuardian } from "@/lib/api/auth";
import { getPatient, updatePatient } from "@/lib/api/patients";
import type { EmergencyContactInput } from "@/lib/api/types";

export const DEMO_PASSWORD = "spark-demo-password";
export const HARDCODED_REGION_CODE = "11530";
export const HARDCODED_INSTITUTION = {
  name: "구로1동 주민센터",
  phone: "02-860-3000",
} as const;

function diagnosisText(guardian: GuardianContextValue) {
  return [
    ...guardian.selectedDiseases.map(
      (id) => DISEASE_OPTIONS.find((option) => option.id === id)?.label ?? id,
    ),
    ...(guardian.customDisease.trim() ? [guardian.customDisease.trim()] : []),
  ].join(", ");
}

function deviceNames(guardian: GuardianContextValue) {
  return guardian.selectedMachines.map(
    (id) => DEVICE_OPTIONS.find((device) => device.id === id)?.name ?? id,
  );
}

function emergencyContacts(guardian: GuardianContextValue): EmergencyContactInput[] {
  const contacts = [
    {
      name: guardian.guardianName,
      phone: guardian.guardianPhones[0]?.number ?? "",
      relationship: "주 보호자",
    },
    ...guardian.otherGuardians.map((contact) => ({
      name: contact.name,
      phone: contact.phone,
      relationship: "보호자",
    })),
    {
      name: HARDCODED_INSTITUTION.name,
      phone: HARDCODED_INSTITUTION.phone,
      relationship: "기관",
    },
  ].filter((contact) => contact.name.trim() && contact.phone.trim());

  return contacts.map((contact, index) => ({ ...contact, priority: index + 1 }));
}

export async function registerGuardianProfile(guardian: GuardianContextValue) {
  const diagnosis = diagnosisText(guardian) || "미입력";
  const devices = deviceNames(guardian);
  const signup = await signupGuardian({
    guardian_name: guardian.guardianName,
    guardian_phone: guardian.guardianPhones[0]?.number ?? "",
    password: DEMO_PASSWORD,
    patient_name: guardian.patientName,
    patient_phone: guardian.patientPhone,
    secondary_phone: null,
    affiliated_institution: HARDCODED_INSTITUTION.name,
    patient_address: `${guardian.addressLine1} ${guardian.addressLine2}`.trim(),
    diagnosis,
    electronic_devices: devices,
  });

  const patient = signup.patients?.[0];
  if (!patient || !signup.guardianCode) {
    throw new Error("가입 응답에서 환자 또는 연결 코드를 확인할 수 없습니다.");
  }

  const detail = await getPatient(patient.id);
  const runtimeMinutes = Math.max(0, Math.floor(guardian.autonomySeconds / 60));
  await updatePatient(patient.id, {
    name: guardian.patientName,
    phone: guardian.patientPhone,
    secondary_phone: null,
    affiliated_institution: HARDCODED_INSTITUTION.name,
    address: guardian.addressLine1,
    address_detail: guardian.addressLine2 || null,
    region_code: HARDCODED_REGION_CODE,
    diagnosis,
    power_profile: {
      safety_margin_minutes: 0,
      backup_power_runtime_minutes: runtimeMinutes,
      backup_power_verified: true,
      devices: devices.map((device) => ({
        device_type: device,
        model_name: null,
        battery_runtime_minutes: 0,
        runtime_verified: true,
        is_essential: true,
      })),
    },
    emergency_contacts: emergencyContacts(guardian),
    version: detail.version,
    change_reason: "보호자 가입 화면에서 환자 전원·연락 정보 등록",
  });

  return signup;
}
