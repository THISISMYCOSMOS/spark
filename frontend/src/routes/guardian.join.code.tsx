import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { InfoCard } from "@/components/guardian/InfoCard";
import { useGuardian } from "@/contexts/GuardianContext";

export const Route = createFileRoute("/guardian/join/code")({
  head: () => ({
    meta: [
      { title: "등록 완료 — 환자 연결 번호 발급" },
      {
        name: "description",
        content: "환자에게 알려줄 여섯 자리 연결 번호를 발급합니다.",
      },
      { property: "og:title", content: "등록 완료 — 환자 연결 번호 발급" },
      {
        property: "og:description",
        content: "여섯 자리 번호로 환자 휴대폰과 연결합니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianJoinCode,
});

function GuardianJoinCode() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/join/confirm");
  const { patientCode, regenerateCode, patientName } = useGuardian();
  const pretty = `${patientCode.slice(0, 3)} ${patientCode.slice(3)}`;

  return (
    <GuardianShell title="등록 완료" time="21:00" network="LTE" onBack={goBack}>
      <Band variant="safe">등록이 끝났습니다</Band>

      <h1 className="t-title-lg font-bold leading-[1.35] text-ink">
        어머니께
        <br />이 번호를 알려주세요
      </h1>
      <p className="t-note-sm leading-[1.5] text-dim">
        어머니 휴대폰에서 이 번호 여섯 자리만 누르면 연결됩니다.
      </p>

      <div className="rounded-[18px] border-2 border-safe-line bg-safe-bg px-[22px] py-[26px] text-center">
        <p className="t-note font-semibold text-safe">환자에게 알려줄 번호</p>
        <p className="mt-2 font-mono t-metric-xl font-semibold tracking-[0.12em] text-safe">
          {pretty}
        </p>
        <p className="mt-2 t-caption text-safe/85">7일 안에 입력해야 합니다</p>
      </div>

      <PrimaryButton
        onClick={() => alert(`${patientName} 님께 ${pretty} 번호를 문자로 보냈습니다.`)}
      >
        이 번호를 문자로 보내기
      </PrimaryButton>
      <GhostButton onClick={regenerateCode}>번호 다시 만들기</GhostButton>

      <InfoCard title="어머니 화면은 이렇게 됩니다">
        번호를 누르면 등록하신 내용이 그대로 뜹니다. 어머니는 아무것도 입력하지 않으셔도 됩니다.
      </InfoCard>

      <GuardianSpacer />

      <GhostButton onClick={() => navigate({ to: "/guardian/home" })}>
        보호자 화면으로 가기
      </GhostButton>
    </GuardianShell>
  );
}
