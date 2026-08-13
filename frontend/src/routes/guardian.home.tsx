import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { InfoCard } from "@/components/guardian/InfoCard";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { DEVICE_OPTIONS, useGuardian } from "@/contexts/GuardianContext";
import { useGuardianOutageFlow } from "@/hooks/useOutageFlow";

export const Route = createFileRoute("/guardian/home")({
  head: () => ({
    meta: [
      { title: "어머니 상태 · 정전 안심 케어" },
      {
        name: "description",
        content: "보호자가 평상시 대상자 상태를 확인하는 화면입니다.",
      },
      { property: "og:title", content: "어머니 상태 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "보호자가 평상시 대상자 상태를 확인하는 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianHome,
});

function shortAddress(addressLine1: string): string {
  const parts = addressLine1.trim().split(/\s+/);
  return parts.slice(0, 2).join(" ");
}

function GuardianHome() {
  const navigate = useNavigate();
  const guardian = useGuardian();

  // 정전이 발생하면 보호자 경보 화면으로 자동 이동합니다.
  useGuardianOutageFlow();

  const selectedMachineNames = guardian.selectedMachines
    .map((id) => DEVICE_OPTIONS.find((d) => d.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  const contactOrder = [
    `1. ${guardian.guardianName} (본인)`,
    ...guardian.otherGuardians.map((g, i) => `${i + 2}. ${g.name}`),
    ...guardian.institutions.map(
      (inst, i) => `${i + 2 + guardian.otherGuardians.length}. ${inst.name}`,
    ),
  ].join(" · ");

  return (
    <GuardianShell
      title="어머니 상태"
      tag={
        <span className="shrink-0 whitespace-nowrap rounded-full bg-safe-bg px-2.5 py-1 t-micro font-semibold text-safe">
          평상시
        </span>
      }
      time="21:00"
      network="LTE"
    >
      <Band variant="safe">오늘도 이상 없습니다 · 21시 00분 확인</Band>

      <h1 className="t-subheading font-bold leading-[1.35] text-ink">{guardian.patientName} 님</h1>
      <p className="t-note leading-[1.5] text-dim">
        {shortAddress(guardian.addressLine1)} · {selectedMachineNames} 사용
      </p>

      {/* 자립시간 카드 */}
      <div className="rounded-[16px] border-[1.5px] border-line bg-wash p-[22px]">
        <p className="t-copy-sm font-medium text-dim">정전이 나면 버틸 수 있는 시간</p>
        <p className="mt-1 t-heading-xl font-bold text-safe">{guardian.autonomyText}</p>
        <div className="mt-4 flex gap-1" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="h-[11px] flex-1 rounded-[3px] bg-safe" />
          ))}
        </div>
      </div>

      <InfoCard title="연락 순서">{contactOrder}</InfoCard>

      <InfoCard title="어머니 앱 상태">연결됨 · 마지막 확인 21시 00분</InfoCard>

      <InfoCard title="확인이 필요합니다">예비 배터리를 점검한 지 3개월이 지났습니다.</InfoCard>

      <GuardianSpacer />

      <PrimaryButton tone="dark" onClick={() => navigate({ to: "/guardian/join/profile" })}>
        등록 정보 고치기
      </PrimaryButton>
      <GhostButton onClick={() => navigate({ to: "/guardian/checkin" })}>안부 묻기</GhostButton>
    </GuardianShell>
  );
}
