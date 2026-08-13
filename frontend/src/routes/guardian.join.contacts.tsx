import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";
import { X } from "lucide-react";

import { useGuardian } from "@/contexts/GuardianContext";
import { AddButton } from "@/components/guardian/AddButton";
import { PrimaryButton } from "@/components/guardian/Buttons";
import { Field } from "@/components/guardian/Field";
import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { PersonRow } from "@/components/guardian/PersonRow";
import { TextInput } from "@/components/guardian/TextInput";

export const Route = createFileRoute("/guardian/join/contacts")({
  head: () => ({
    meta: [
      { title: "연락처 등록 — 정전 돌봄 등록 4단계" },
      {
        name: "description",
        content: "정전 시 연락할 보호자와 기관 정보를 등록하는 단계입니다.",
      },
      { property: "og:title", content: "연락처 등록 — 정전 돌봄 등록 4단계" },
      {
        property: "og:description",
        content: "정전 대응에 필요한 연락처를 등록합니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianJoinContacts,
});

function GuardianJoinContacts() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/join/health");
  const {
    guardianName,
    guardianPhones,
    otherGuardians,
    institutions,
    addOtherGuardian,
    updateOtherGuardian,
    removeOtherGuardian,
    addInstitution,
    updateInstitution,
    removeInstitution,
  } = useGuardian();

  const selfPhone = guardianPhones[0]?.number ?? "";

  // 본인(1) → 다른 보호자(2~n) → 기관(n+1~) 순서로 전체 순위를 매깁니다.
  const institutionStartRank = 2 + otherGuardians.length;

  return (
    <GuardianShell
      title="보호자 등록"
      tag={<span className="whitespace-nowrap t-caption-sm font-semibold text-mute">4 / 5</span>}
      time="21:00"
      network="LTE"
      progress={4}
      onBack={goBack}
    >
      <h1 className="t-title-lg font-bold leading-[1.35] text-ink">
        누구에게
        <br />
        연락이 갈까요?
      </h1>
      <p className="t-note-sm leading-[1.5] text-dim">
        위에서부터 순서대로 연락합니다. 앞사람이 확인하지 않으면 다음으로 넘어갑니다.
      </p>

      <PersonRow
        rank={1}
        name={`${guardianName} (본인)`}
        desc={selfPhone}
        status="ok"
        statusLabel="확인"
      />

      <Field label="다른 보호자" help="가족, 이웃, 활동지원사 등 누구든 넣을 수 있습니다.">
        <div className="flex flex-col gap-2">
          {otherGuardians.map((g, index) => (
            <div key={g.id} className="flex items-start gap-2">
              <span className="mt-3 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-wash font-mono t-caption-sm text-ink2">
                {index + 2}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <TextInput
                  value={g.name}
                  onChange={(e) => updateOtherGuardian(g.id, { name: e.target.value })}
                  placeholder="이름"
                />
                <TextInput
                  value={g.phone}
                  onChange={(e) => updateOtherGuardian(g.id, { phone: e.target.value })}
                  placeholder="전화번호"
                />
              </div>
              <button
                type="button"
                onClick={() => removeOtherGuardian(g.id)}
                aria-label={`${g.name || "보호자"} 삭제`}
                className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-mute transition-colors hover:bg-wash hover:text-crit focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-crit/25"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
        <AddButton onClick={addOtherGuardian}>+ 보호자 추가</AddButton>
      </Field>

      <Field label="기관 연락처" help="주민센터, 복지관, 방문간호 기관 등을 넣어두세요.">
        <div className="flex flex-col gap-2">
          {institutions.map((inst, index) => (
            <div key={inst.id} className="flex items-start gap-2">
              <span className="mt-3 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-wash font-mono t-caption-sm text-ink2">
                {institutionStartRank + index}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <TextInput
                  value={inst.name}
                  onChange={(e) => updateInstitution(inst.id, { name: e.target.value })}
                  placeholder="기관 이름"
                />
                <TextInput
                  value={inst.phone}
                  onChange={(e) => updateInstitution(inst.id, { phone: e.target.value })}
                  placeholder="전화번호"
                />
              </div>
              <button
                type="button"
                onClick={() => removeInstitution(inst.id)}
                aria-label={`${inst.name || "기관"} 삭제`}
                className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-mute transition-colors hover:bg-wash hover:text-crit focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-crit/25"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
        <AddButton onClick={addInstitution}>+ 기관 추가</AddButton>
      </Field>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/join/confirm" })}>다음</PrimaryButton>
    </GuardianShell>
  );
}
