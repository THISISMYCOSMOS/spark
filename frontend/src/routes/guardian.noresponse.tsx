import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { DuoStat } from "@/components/guardian/DuoStat";
import { Timeline } from "@/components/guardian/Timeline";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { OutageTag } from "@/components/guardian/OutageTag";
import { useGuardianOutageFlow } from "@/hooks/useOutageFlow";
import { useGuardian } from "@/contexts/GuardianContext";

export const Route = createFileRoute("/guardian/noresponse")({
  head: () => ({
    meta: [
      { title: "응답 없음 · 정전 안심 케어" },
      {
        name: "description",
        content: "정전 중 대상자가 3분간 답하지 않아 자동 전달된 화면입니다.",
      },
      { property: "og:title", content: "응답 없음 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "정전 중 대상자가 3분간 답하지 않아 자동 전달된 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianNoResponse,
});

function GuardianNoResponse() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/alert");
  useGuardianOutageFlow();
  const guardian = useGuardian();
  const otherName = guardian.otherGuardians[0]?.name ?? "다른 보호자";

  return (
    <GuardianShell
      title="응답 없음"
      time="21:50"
      network="정전 지역 · LTE"
      tag={<OutageTag />}
      onBack={goBack}
    >
      <Band variant="crit" live>
        3분간 응답이 없습니다
      </Band>

      <h1 className="mt-4 whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"어머니가\n답하지 않으십니다"}
      </h1>
      <p className="mt-2 t-note leading-[1.5] text-dim">
        화면을 못 보셨거나, 누르지 못하는 상황일 수 있습니다. 가장 위험한 경우로 보고 있습니다.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <DuoStat
          left={{
            label: "버틸 수 있는 시간",
            value: "2시간 41분",
            tone: "crit",
          }}
          right={{ label: "도착까지", value: "12분", tone: "safe" }}
        />

        <Timeline
          items={[
            {
              time: "21:47",
              title: "어머니께 알림 보냄",
              desc: "화면·소리·진동",
              status: "done",
            },
            {
              time: "21:50",
              title: "3분 무응답",
              desc: "규칙에 따라 보호자에게 자동 전달",
              status: "auto",
            },
            {
              time: "21:50",
              title: `${otherName} 님께도 알림`,
              desc: "아직 확인하지 않음",
              status: "now",
            },
            {
              time: "대기",
              title: "주민센터 연락",
              desc: "10분 더 지나면 자동 연락",
              status: "wait",
            },
          ]}
        />
      </div>

      <GuardianSpacer />

      <PrimaryButton tone="crit" onClick={() => navigate({ to: "/guardian/progress" })}>
        지금 출발하기
      </PrimaryButton>
      <GhostButton
        className="mt-2.5"
        onClick={() => {
          window.location.href = `tel:${guardian.patientPhone}`;
        }}
      >
        어머니께 전화하기
      </GhostButton>
    </GuardianShell>
  );
}
