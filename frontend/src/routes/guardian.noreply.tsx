import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { InfoCard } from "@/components/guardian/InfoCard";
import { ActionGrid } from "@/components/guardian/ActionGrid";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { useGuardian } from "@/contexts/GuardianContext";
import { useGuardianOutageFlow } from "@/hooks/useOutageFlow";

export const Route = createFileRoute("/guardian/noreply")({
  head: () => ({
    meta: [
      { title: "답이 없음 · 정전 안심 케어" },
      {
        name: "description",
        content: "보호자가 대상자의 안부 응답이 없을 때 대처하는 화면입니다.",
      },
      { property: "og:title", content: "답이 없음 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "보호자가 대상자의 안부 응답이 없을 때 대처하는 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianNoReply,
});

function GuardianNoReply() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/home");
  const guardian = useGuardian();

  // 정전 발생 시 보호자 경보 화면으로 자동 이동합니다.
  useGuardianOutageFlow();

  const otherName = guardian.otherGuardians[0]?.name ?? "다른 보호자";

  return (
    <GuardianShell
      title="답이 없음"
      time="21:00"
      network="LTE"
      tag={
        <span className="shrink-0 whitespace-nowrap rounded-full bg-safe-bg px-2.5 py-1 t-micro font-semibold text-safe">
          평상시
        </span>
      }
      onBack={goBack}
    >
      <Band variant="warn" live>
        2시간째 답이 없습니다
      </Band>

      <h1 className="whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"어머니가\n아직 안 누르셨어요"}
      </h1>
      <p className="t-note leading-[1.5] text-dim">
        주무시거나 휴대폰을 못 보셨을 수 있습니다. 급한 상황은 아닙니다.
      </p>

      <div className="rounded-[16px] border-[1.5px] border-line bg-wash p-[22px]">
        <p className="t-copy-sm font-medium text-dim">마지막으로 확인된 시각</p>
        <p className="mt-1 t-heading-xl font-bold text-warn">2시간 12분 전</p>
        <p className="mt-1 t-note-sm leading-[1.5] text-dim">어머니 앱은 정상 연결되어 있습니다</p>
      </div>

      <p className="t-copy-sm font-semibold text-ink">무엇을 해볼까요?</p>

      <ActionGrid
        items={[
          { id: "call", title: "전화 걸기", desc: "목소리로 확인" },
          { id: "ask", title: "다시 묻기", desc: "알림 한 번 더" },
          {
            id: "delegate",
            title: `${otherName} 님께`,
            desc: "복지사에게 부탁",
          },
          { id: "visit", title: "방문하기", desc: "차로 12분" },
        ]}
        selected={[]}
      />

      <GuardianSpacer />

      <PrimaryButton
        onClick={() => {
          window.location.href = `tel:${guardian.patientPhone}`;
        }}
      >
        어머니께 전화하기
      </PrimaryButton>
      <GhostButton onClick={() => navigate({ to: "/guardian/home" })}>돌아가기</GhostButton>
    </GuardianShell>
  );
}
