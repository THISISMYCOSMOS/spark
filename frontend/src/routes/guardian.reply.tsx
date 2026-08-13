import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { InfoCard } from "@/components/guardian/InfoCard";
import { Timeline } from "@/components/guardian/Timeline";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { useGuardianOutageFlow } from "@/hooks/useOutageFlow";

export const Route = createFileRoute("/guardian/reply")({
  head: () => ({
    meta: [
      { title: "어머니 답장 · 정전 안심 케어" },
      {
        name: "description",
        content: "보호자가 대상자의 안부 응답을 확인하는 화면입니다.",
      },
      { property: "og:title", content: "어머니 답장 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "보호자가 대상자의 안부 응답을 확인하는 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianReply,
});

function GuardianReply() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/home");

  // 정전 발생 시 보호자 경보 화면으로 자동 이동합니다.
  useGuardianOutageFlow();

  return (
    <GuardianShell
      title="어머니 답장"
      time="21:00"
      network="LTE"
      tag={
        <span className="shrink-0 whitespace-nowrap rounded-full bg-safe-bg px-2.5 py-1 t-micro font-semibold text-safe">
          평상시
        </span>
      }
      onBack={goBack}
    >
      <Band variant="safe">어머니가 답하셨습니다 · 4분 만에</Band>

      <h1 className="whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"괜찮다고\n하셨습니다"}
      </h1>
      <p className="t-note leading-[1.5] text-dim">어머니가 직접 "괜찮습니다"를 누르셨습니다.</p>

      <Timeline
        items={[
          {
            time: "21:00",
            title: "안부 보냄",
            desc: "어머니 화면에 표시됨",
            status: "done",
          },
          {
            time: "21:04",
            title: "어머니가 읽음",
            desc: "화면을 켜셨습니다",
            status: "done",
          },
          {
            time: "21:04",
            title: "괜찮습니다",
            desc: "어머니가 직접 누르셨습니다",
            status: "done",
          },
        ]}
      />

      <InfoCard title="이번 주 응답" tone="safe">
        3번 물어보고 3번 모두 답하셨습니다. 평균 6분 만에 답하십니다.
      </InfoCard>

      <InfoCard title="아직 남은 일" tone="warn">
        예비 배터리를 점검한 지 3개월이 지났습니다.
      </InfoCard>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/home" })}>
        고맙다고 답장하기
      </PrimaryButton>
      <GhostButton onClick={() => navigate({ to: "/guardian/home" })}>돌아가기</GhostButton>
    </GuardianShell>
  );
}
