import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Field } from "@/components/guardian/Field";
import { TextInput } from "@/components/guardian/TextInput";
import { PrimaryButton } from "@/components/guardian/Buttons";
import { useGuardian } from "@/contexts/GuardianContext";

export const Route = createFileRoute("/guardian/join/patient")({
  head: () => ({
    meta: [
      { title: "돌보는 분 정보 입력 — 정전 돌봄 등록 2단계" },
      {
        name: "description",
        content: "정전 시 사람이 찾아갈 주소와 환자 이름, 나이, 연락처를 등록합니다.",
      },
      { property: "og:title", content: "돌보는 분 정보 입력 — 정전 돌봄 등록 2단계" },
      {
        property: "og:description",
        content: "정전 알림이 갈 환자 연락처와 119에 전달될 주소를 입력합니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianJoinPatient,
});

function GuardianJoinPatient() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/join/profile");
  const { patientName, patientAge, patientPhone, addressLine1, addressLine2, setField } =
    useGuardian();

  return (
    <GuardianShell
      title="보호자 등록"
      tag={<span className="whitespace-nowrap t-caption-sm font-semibold text-mute">2 / 5</span>}
      time="21:00"
      network="LTE"
      progress={2}
      onBack={goBack}
    >
      <h1 className="whitespace-pre-line t-title-lg font-bold leading-[1.35] text-ink">
        {"돌보시는 분의\n정보를 알려주세요"}
      </h1>
      <p className="mt-2 t-note-sm leading-[1.5] text-dim">
        정전이 났을 때 이 주소로 사람이 갑니다.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <Field label="환자 이름">
          <TextInput
            value={patientName}
            aria-label="환자 이름"
            onChange={(e) => setField("patientName", e.target.value)}
          />
        </Field>

        <Field label="나이">
          <TextInput
            value={patientAge}
            inputMode="numeric"
            aria-label="나이"
            onChange={(e) => setField("patientAge", e.target.value)}
          />
        </Field>

        <Field label="환자 전화번호" help="이 번호로 정전 알림과 확인 문자가 갑니다.">
          <TextInput
            value={patientPhone}
            inputMode="tel"
            aria-label="환자 전화번호"
            onChange={(e) => setField("patientPhone", e.target.value)}
          />
        </Field>

        <Field label="주소" help="119에 전달될 정보입니다. 동·호수까지 정확히 적어주세요.">
          <TextInput
            value={addressLine1}
            aria-label="주소"
            onChange={(e) => setField("addressLine1", e.target.value)}
          />
          <TextInput
            value={addressLine2}
            aria-label="상세 주소"
            onChange={(e) => setField("addressLine2", e.target.value)}
          />
        </Field>
      </div>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/join/health" })}>다음</PrimaryButton>
    </GuardianShell>
  );
}
