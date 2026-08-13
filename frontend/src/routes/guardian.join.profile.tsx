import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Field } from "@/components/guardian/Field";
import { TextInput } from "@/components/guardian/TextInput";
import { PrimaryButton } from "@/components/guardian/Buttons";
import { useGuardian, type PhoneKind, type PhoneEntry } from "@/contexts/GuardianContext";

export const Route = createFileRoute("/guardian/join/profile")({
  head: () => ({
    meta: [
      { title: "보호자 정보 입력 — 정전 돌봄 등록 1단계" },
      {
        name: "description",
        content: "정전이 났을 때 가장 먼저 연락받을 보호자 이름과 전화번호를 등록합니다.",
      },
      { property: "og:title", content: "보호자 정보 입력 — 정전 돌봄 등록 1단계" },
      {
        property: "og:description",
        content: "정전 알림을 가장 먼저 받을 보호자 연락처를 등록하는 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianJoinProfile,
});

const KINDS: PhoneKind[] = ["휴대폰", "집", "직장"];

function GuardianJoinProfile() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/home");
  const { guardianName, guardianPhones, setField } = useGuardian();
  const phone = guardianPhones[0] ?? { id: "phone-1", kind: "휴대폰", number: "" };

  const updatePhone = (patch: Partial<Omit<PhoneEntry, "id">>) => {
    setField(
      "guardianPhones",
      guardianPhones.map((p) => (p.id === phone.id ? { ...p, ...patch } : p)),
    );
  };

  return (
    <GuardianShell
      title="보호자 등록"
      tag={<span className="whitespace-nowrap t-caption-sm font-semibold text-mute">1 / 5</span>}
      time="21:00"
      network="LTE"
      progress={1}
      onBack={goBack}
    >
      <h1 className="whitespace-pre-line t-title-lg font-bold leading-[1.35] text-ink">
        {"먼저 보호자님\n정보를 알려주세요"}
      </h1>
      <p className="mt-2 t-note-sm leading-[1.5] text-dim">
        정전이 났을 때 가장 먼저 연락받을 분입니다.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <Field label="보호자 이름">
          <TextInput
            value={guardianName}
            onChange={(e) => setField("guardianName", e.target.value)}
            aria-label="보호자 이름"
          />
        </Field>

        <Field label="본인 전화번호">
          <div className="flex items-center gap-2">
            <select
              value={phone.kind}
              onChange={(e) => updatePhone({ kind: e.target.value as PhoneKind })}
              aria-label="전화번호 종류"
              className="h-[50px] w-[112px] shrink-0 rounded-[12px] border-[1.5px] border-field-line bg-paper px-[12px] t-input text-ink focus:border-safe focus:shadow-[0_0_0_3px_var(--safe-line)] focus:outline-none"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <TextInput
              value={phone.number}
              inputMode="tel"
              placeholder="010-0000-0000"
              aria-label="본인 전화번호"
              onChange={(e) => updatePhone({ number: e.target.value })}
            />
          </div>
        </Field>
      </div>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/join/patient" })}>다음</PrimaryButton>
    </GuardianShell>
  );
}
