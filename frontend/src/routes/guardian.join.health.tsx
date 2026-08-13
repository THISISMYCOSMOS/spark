import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Field } from "@/components/guardian/Field";
import { TextInput } from "@/components/guardian/TextInput";
import { PrimaryButton } from "@/components/guardian/Buttons";
import { ChipGroup } from "@/components/guardian/ChipGroup";
import { MachineList } from "@/components/guardian/MachineList";
import { DISEASE_OPTIONS, DEVICE_OPTIONS, useGuardian } from "@/contexts/GuardianContext";

export const Route = createFileRoute("/guardian/join/health")({
  head: () => ({
    meta: [
      { title: "건강 정보 입력 — 정전 돌봄 등록 3단계" },
      {
        name: "description",
        content: "정전 시 필요한 의료기기와 건강 상태를 등록하는 단계입니다.",
      },
      { property: "og:title", content: "건강 정보 입력 — 정전 돌봄 등록 3단계" },
      {
        property: "og:description",
        content: "정전 대응에 필요한 의료기기와 건강 정보를 등록합니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianJoinHealth,
});

function GuardianJoinHealth() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/join/patient");
  const {
    selectedDiseases,
    customDisease,
    selectedMachines,
    autonomyText,
    autonomySeconds,
    totalWatts,
    toggleDisease,
    setCustomDisease,
    toggleMachine,
  } = useGuardian();

  const canProceed = totalWatts > 0;

  return (
    <GuardianShell
      title="보호자 등록"
      tag={<span className="whitespace-nowrap t-caption-sm font-semibold text-mute">3 / 5</span>}
      time="21:00"
      network="LTE"
      progress={3}
      onBack={goBack}
    >
      <h1 className="t-title-lg font-bold leading-[1.35] text-ink">
        어떤 병으로
        <br />
        어떤 기계를 쓰시나요?
      </h1>
      <p className="t-note-sm leading-[1.5] text-dim">
        기계 소비전력으로 버틸 수 있는 시간을 계산합니다.
      </p>

      <Field label="병명">
        <ChipGroup options={DISEASE_OPTIONS} selected={selectedDiseases} onToggle={toggleDisease} />
        <TextInput
          value={customDisease}
          onChange={(e) => setCustomDisease(e.target.value)}
          placeholder="다른 병명을 직접 적어주세요"
        />
      </Field>

      <Field label="사용하는 기계" help="기계를 고르면 자동으로 다시 계산합니다.">
        <MachineList
          devices={DEVICE_OPTIONS}
          selected={selectedMachines}
          onToggle={toggleMachine}
        />

        <div className="rounded-[14px] border-[1.5px] border-line bg-wash p-4">
          <p className="t-caption font-medium text-dim">정전이 나면 버틸 수 있는 시간</p>
          <p className={`mt-1 t-subheading font-bold ${canProceed ? "text-safe" : "text-dim"}`}>
            {autonomyText}
          </p>
          {canProceed ? (
            <p className="mt-1 t-caption-sm text-mute">
              선택한 기계 {totalWatts}W · 예비 배터리 500Wh 기준
            </p>
          ) : null}
        </div>
      </Field>

      <GuardianSpacer />

      <PrimaryButton
        disabled={!canProceed}
        onClick={() => navigate({ to: "/guardian/join/contacts" })}
      >
        다음
      </PrimaryButton>
    </GuardianShell>
  );
}
