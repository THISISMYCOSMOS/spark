import {
  DEVICE_OPTIONS,
  DISEASE_OPTIONS,
  type GuardianContextValue,
} from "@/contexts/GuardianContext";

export type SummaryRow = { label: string; value: string };

/** 보호자가 등록한 내용을 요약 행으로 만듭니다. */
export function buildGuardianSummary(g: GuardianContextValue): SummaryRow[] {
  const diseases = [
    ...g.selectedDiseases.map((id) => DISEASE_OPTIONS.find((d) => d.id === id)?.label ?? id),
    ...(g.customDisease.trim() ? [g.customDisease.trim()] : []),
  ];

  const machines = g.selectedMachines.map(
    (id) => DEVICE_OPTIONS.find((d) => d.id === id)?.name ?? id,
  );

  const order = [
    g.guardianName,
    ...g.otherGuardians.map((c) => c.name).filter(Boolean),
    ...g.institutions.map((c) => c.name).filter(Boolean),
  ].map((name, i) => `${i + 1}. ${name}`);

  return [
    {
      label: "보호자",
      value: `${g.guardianName}\n${g.guardianPhones[0]?.number ?? ""}`,
    },
    {
      label: "환자",
      value: `${g.patientName} (${g.patientAge}세)\n${g.patientPhone}`,
    },
    { label: "주소", value: `${g.addressLine1}\n${g.addressLine2}` },
    { label: "병명", value: diseases.join(", ") || "-" },
    { label: "기계", value: machines.join(", ") || "-" },
    { label: "버틸 시간", value: g.autonomyText },
    { label: "연락 순서", value: order.join("\n") },
  ];
}
