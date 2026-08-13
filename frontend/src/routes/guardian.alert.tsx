import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { DuoStat } from "@/components/guardian/DuoStat";
import { InfoCard } from "@/components/guardian/InfoCard";
import { PrimaryButton } from "@/components/guardian/Buttons";
import { OutageTag } from "@/components/guardian/OutageTag";
import { useGuardianOutageFlow, useOutageInfo } from "@/hooks/useOutageFlow";
import { useOutage } from "@/contexts/OutageContext";
import { isRealApiMode } from "@/lib/api/client";
import {
  formatKoreanDuration,
  serverRemainingSeconds,
  serverResponseSeconds,
} from "@/lib/outageTime";

export const Route = createFileRoute("/guardian/alert")({
  head: () => ({
    meta: [
      { title: "정전 알림 · 정전 안심 케어" },
      {
        name: "description",
        content: "대상자 댁에 정전이 발생해 응답을 기다리는 보호자 화면입니다.",
      },
      { property: "og:title", content: "정전 알림 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "대상자 댁에 정전이 발생해 응답을 기다리는 보호자 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianAlert,
});

function GuardianAlert() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/home");
  useGuardianOutageFlow();
  const { bandLabel, restoreLabel } = useOutageInfo();
  const { currentImpactCase } = useOutage();
  const realMode = isRealApiMode();
  const [left, setLeft] = useState(() =>
    realMode ? (serverResponseSeconds(currentImpactCase) ?? 180) : 180,
  );
  const [runtime, setRuntime] = useState(() =>
    realMode ? (serverRemainingSeconds(currentImpactCase) ?? 10080) : 10080,
  );

  useEffect(() => {
    setLeft(realMode ? (serverResponseSeconds(currentImpactCase) ?? 180) : 180);
    setRuntime(realMode ? (serverRemainingSeconds(currentImpactCase) ?? 10080) : 10080);
    const id = window.setInterval(() => {
      if (realMode) {
        setLeft(serverResponseSeconds(currentImpactCase) ?? 180);
        setRuntime(serverRemainingSeconds(currentImpactCase) ?? 10080);
      } else {
        setLeft((v) => (v > 0 ? v - 1 : 0));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [currentImpactCase, realMode]);

  useEffect(() => {
    if (left === 0) void navigate({ to: "/guardian/noresponse" });
  }, [left, navigate]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <GuardianShell
      title="정전 알림"
      time="21:50"
      network="정전 지역 · LTE"
      tag={<OutageTag />}
      onBack={goBack}
    >
      <Band variant="crit" live>
        {bandLabel}
      </Band>

      <h1 className="mt-4 whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"어머니 댁에\n전기가 끊겼습니다"}
      </h1>
      <p className="mt-2 t-note leading-[1.5] text-dim">
        어머니께 확인 알림을 보냈습니다. 답을 기다리는 중입니다. {restoreLabel}.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <DuoStat
          left={{ label: "버틸 수 있는 시간", value: formatKoreanDuration(runtime), tone: "warn" }}
          right={{ label: "현재 위치에서", value: "차로 12분", tone: "ink" }}
        />

        <div className="flex items-center gap-3 rounded-[14px] bg-crit-bg px-[18px] py-4">
          <span className="shrink-0 font-mono t-subheading font-semibold text-crit">
            {mm}:{ss}
          </span>
          <span className="t-note-sm font-medium leading-[1.45] text-crit">
            어머니가 3분 안에 답하지 않으면 자동으로 알려드립니다.
          </span>
        </div>

        <InfoCard title="지금 상태">
          산소발생기는 예비 배터리로 작동 중입니다. 전동침대는 멈췄습니다.
        </InfoCard>
      </div>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/response" })}>
        기다리지 않고 전화하기
      </PrimaryButton>
    </GuardianShell>
  );
}
