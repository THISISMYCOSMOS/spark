import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { InfoCard } from "@/components/guardian/InfoCard";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { OutageTag } from "@/components/guardian/OutageTag";
import { useGuardian } from "@/contexts/GuardianContext";
import { useOutageInfo } from "@/hooks/useOutageFlow";

export const Route = createFileRoute("/guardian/closed")({
  head: () => ({
    meta: [
      { title: "상황 종료 · 정전 안심 케어" },
      {
        name: "description",
        content: "정전 대응을 마치고 기록을 정리하는 보호자 화면입니다.",
      },
      { property: "og:title", content: "상황 종료 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "정전 대응을 마치고 기록을 정리하는 보호자 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianClosed,
});

function GuardianClosed() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/home");
  const { autonomyText } = useGuardian();
  const { endAt } = useOutageInfo();

  return (
    <GuardianShell
      title="상황 종료"
      time="21:50"
      network="정전 지역 · LTE"
      tag={<OutageTag />}
      onBack={goBack}
    >
      <Band variant="safe">{`상황 종료 · ${endAt}`}</Band>

      <h1 className="mt-4 whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"어머니는\n안전합니다"}
      </h1>
      <p className="mt-2 t-note leading-[1.5] text-dim">
        이번 기록은 다음 정전 때 버틸 수 있는 시간 계산에 반영됩니다.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <InfoCard title="총 대응 시간">
          알림부터 전원 연결까지 23분 · 버틸 수 있는 시간 41분 안에 해결
        </InfoCard>

        <InfoCard tone="warn" title="확인된 약점">
          예비 배터리가 90분에 그쳤습니다. 등록할 때 계산한 {autonomyText}보다 짧습니다.
        </InfoCard>

        <InfoCard title="참여">보호자 2명 · 구로1동 담당자 1명 · 119 미출동</InfoCard>
      </div>

      <GuardianSpacer />

      <PrimaryButton tone="dark" onClick={() => navigate({ to: "/guardian/home" })}>
        기록 저장하고 닫기
      </PrimaryButton>
      <GhostButton className="mt-2.5">배터리 점검 예약하기</GhostButton>
    </GuardianShell>
  );
}
