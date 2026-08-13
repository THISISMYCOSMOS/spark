import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { DuoStat } from "@/components/guardian/DuoStat";
import { InfoCard } from "@/components/guardian/InfoCard";
import { ActionGrid } from "@/components/guardian/ActionGrid";
import { PrimaryButton } from "@/components/guardian/Buttons";
import { OutageTag } from "@/components/guardian/OutageTag";
import { useGuardianOutageFlow } from "@/hooks/useOutageFlow";

export const Route = createFileRoute("/guardian/response")({
  head: () => ({
    meta: [
      { title: "어머니 응답 · 정전 안심 케어" },
      {
        name: "description",
        content: "대상자가 도움을 요청해 보호자가 할 일을 나누는 화면입니다.",
      },
      { property: "og:title", content: "어머니 응답 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "대상자가 도움을 요청해 보호자가 할 일을 나누는 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianResponse,
});

/** 남은 자립 시간과 도착 소요 시간(분) */
const AUTONOMY_MINUTES = 41;
const ARRIVAL_MINUTES = 12;

function GuardianResponse() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/alert");
  useGuardianOutageFlow();
  const [selected, setSelected] = useState<string[]>(["go", "power"]);

  const inTime = ARRIVAL_MINUTES <= AUTONOMY_MINUTES;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  return (
    <GuardianShell
      title="어머니 응답"
      time="21:50"
      network="정전 지역 · LTE"
      tag={<OutageTag />}
      onBack={goBack}
    >
      <Band variant="crit">어머니가 도움을 요청하셨습니다</Band>

      <h1 className="mt-4 whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"지금\n가셔야 합니다"}
      </h1>
      <p className="mt-2 t-note leading-[1.5] text-dim">
        어머니가 &ldquo;도와주세요&rdquo;를 누르셨습니다. 119에도 연락이 갔습니다.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <DuoStat
          left={{
            label: "버틸 수 있는 시간",
            value: `${AUTONOMY_MINUTES}분`,
            tone: "crit",
          }}
          right={{
            label: "도착까지",
            value: `${ARRIVAL_MINUTES}분`,
            tone: "safe",
          }}
        />

        {inTime ? (
          <InfoCard tone="safe" title="시간은 됩니다">
            배터리가 떨어지기 전에 도착할 수 있습니다.
          </InfoCard>
        ) : (
          <InfoCard tone="crit" title="도착이 늦습니다">
            119에 연락하는 것이 좋습니다.
          </InfoCard>
        )}

        <p className="t-copy-sm font-semibold text-ink">무엇을 맡으시겠어요?</p>

        <ActionGrid
          items={[
            { id: "go", title: "지금 출발", desc: "차로 12분 거리" },
            { id: "call", title: "전화 걸기", desc: "가면서 통화" },
            { id: "power", title: "보조 전원", desc: "배터리 챙기기" },
            { id: "119", title: "119 확인", desc: "출동 여부 확인" },
          ]}
          selected={selected}
          onToggle={toggle}
        />
      </div>

      <GuardianSpacer />

      <PrimaryButton tone="crit" onClick={() => navigate({ to: "/guardian/progress" })}>
        맡은 일 시작하기
      </PrimaryButton>
    </GuardianShell>
  );
}
