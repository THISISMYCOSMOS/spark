import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { PersonRow } from "@/components/guardian/PersonRow";
import { InfoCard } from "@/components/guardian/InfoCard";
import { ActionGrid } from "@/components/guardian/ActionGrid";
import { PrimaryButton } from "@/components/guardian/Buttons";
import { OutageTag } from "@/components/guardian/OutageTag";
import { useGuardianOutageFlow } from "@/hooks/useOutageFlow";
import { useGuardian } from "@/contexts/GuardianContext";

export const Route = createFileRoute("/guardian/progress")({
  head: () => ({
    meta: [
      { title: "대응 진행 · 정전 안심 케어" },
      {
        name: "description",
        content: "보호자와 담당자가 함께 보는 정전 대응 진행 화면입니다.",
      },
      { property: "og:title", content: "대응 진행 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "보호자와 담당자가 함께 보는 정전 대응 진행 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianProgress,
});

function GuardianProgress() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/alert");
  useGuardianOutageFlow();
  const guardian = useGuardian();
  const [selected, setSelected] = useState<string[]>([]);

  const otherName = guardian.otherGuardians[0]?.name ?? "다른 보호자";
  const instName = guardian.institutions[0]?.name ?? "주민센터";

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  return (
    <GuardianShell
      title="대응 진행"
      time="21:50"
      network="정전 지역 · LTE"
      tag={<OutageTag />}
      onBack={goBack}
    >
      <Band variant="warn" live>
        대응 진행 중 · 도착 예정 22시 05분
      </Band>

      <h1 className="mt-4 whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"지금\n가고 있습니다"}
      </h1>
      <p className="mt-2 t-note leading-[1.5] text-dim">
        진행 상황은 다른 보호자와 담당자에게도 함께 보입니다.
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        <PersonRow
          rank={1}
          name={`${guardian.guardianName} (본인)`}
          desc="보조 전원 가지고 이동 중"
          status="ok"
          statusLabel="이동 중"
        />
        <PersonRow
          rank={2}
          name={`${otherName} (복지사)`}
          desc="알림 확인함"
          status="wait"
          statusLabel="대기"
        />
        <PersonRow
          rank={3}
          name={instName}
          desc="담당자 수락 · 22시 05분 방문"
          status="ok"
          statusLabel="수락"
        />

        <InfoCard title="어머니 상태">
          21시 52분 확인 · 의식과 호흡 정상 · 산소발생기 예비 전원 작동 중
        </InfoCard>

        <ActionGrid
          items={[
            { id: "arrived", title: "도착했어요", desc: "전원 연결 완료" },
            { id: "late", title: "늦어집니다", desc: "다른 사람에게 알림" },
          ]}
          selected={selected}
          onToggle={toggle}
        />
      </div>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/closed" })}>
        도착해서 전원을 연결했습니다
      </PrimaryButton>
    </GuardianShell>
  );
}
