import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { AlertScreen } from "@/components/AlertScreen";
import { AiResponsePlanDialog } from "@/components/AiResponsePlanDialog";
import { useApp, type AlertAnswer } from "@/contexts/AppContext";
import { useOutageInfo, useOutageRedirect } from "@/hooks/useOutageFlow";
import { useOutage } from "@/contexts/OutageContext";
import { aiResponsePlan } from "@/data/mock";
import { isRealApiMode } from "@/lib/api/client";
import {
  serverRemainingSeconds,
  serverResponseSeconds,
  serverRuntimeSeconds,
} from "@/lib/outageTime";

export const Route = createFileRoute("/alert/")({
  head: () => ({
    meta: [
      { title: "정전 경보 · 정전 안심 케어" },
      {
        name: "description",
        content: "정전이 발생했습니다. 지금 상태를 알려주세요.",
      },
      { property: "og:title", content: "정전 경보 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "정전이 발생했습니다. 지금 상태를 알려주세요.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const { setAnswer, setAlertSnapshot, demo } = useApp();
  const { bandLabel } = useOutageInfo();
  const { currentImpactCase, setPatientAnswer, submitPatientAnswer } = useOutage();

  // 정전이 끝나면(mode: 'calm') 마무리 화면으로 이동합니다.
  useOutageRedirect("calm", "/after/done", true);

  const realMode = isRealApiMode();
  const serverTotal = serverRuntimeSeconds(currentImpactCase);
  const totalSeconds = realMode && serverTotal !== null ? serverTotal : demo.autonomySeconds;
  const [remaining, setRemaining] = useState(() =>
    realMode
      ? (serverRemainingSeconds(currentImpactCase) ?? demo.autonomySeconds)
      : demo.autonomySeconds,
  );
  const [countdown, setCountdown] = useState(() =>
    realMode
      ? (serverResponseSeconds(currentImpactCase) ?? demo.escalationSeconds)
      : demo.escalationSeconds,
  );
  const [isPlanOpen, setIsPlanOpen] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const plan = realMode ? currentImpactCase?.impactCase.responsePlan : aiResponsePlan;
  const isVisiblePlanOpen = Boolean(plan) && isPlanOpen;

  const answeredRef = useRef(false);

  const answerAndGo = async (answer: Exclude<AlertAnswer, null>) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setSubmitError("");
    try {
      if (answer === "none") setPatientAnswer(answer);
      else await submitPatientAnswer(answer);
    } catch (cause) {
      answeredRef.current = false;
      setSubmitError(
        cause instanceof Error ? cause.message : "상태를 전송하지 못했습니다. 다시 눌러주세요.",
      );
      return;
    }
    setAnswer(answer);
    setAlertSnapshot({ remaining, countdown });
    await navigate({ to: "/alert/sent" });
  };

  // 화면에 들어온 순간 시작하고, 벗어나면 정지합니다.
  useEffect(() => {
    setRemaining(
      realMode
        ? (serverRemainingSeconds(currentImpactCase) ?? demo.autonomySeconds)
        : demo.autonomySeconds,
    );
    setCountdown(
      realMode
        ? (serverResponseSeconds(currentImpactCase) ?? demo.escalationSeconds)
        : demo.escalationSeconds,
    );
  }, [
    currentImpactCase,
    currentImpactCase?.impactCase.id,
    currentImpactCase?.impactCase.effectiveRuntimeMinutes,
    currentImpactCase?.impactCase.responseDueAt,
    currentImpactCase?.outage.startedAt,
    currentImpactCase?.outage.scheduledStartAt,
    demo.autonomySeconds,
    demo.escalationSeconds,
    realMode,
  ]);

  useEffect(() => {
    if (!realMode && isVisiblePlanOpen) return;
    const id = window.setInterval(
      () => {
        if (realMode) {
          setRemaining(serverRemainingSeconds(currentImpactCase) ?? demo.autonomySeconds);
          setCountdown(serverResponseSeconds(currentImpactCase) ?? demo.escalationSeconds);
        } else {
          setRemaining((prev) => Math.max(0, prev - 1));
          setCountdown((prev) => Math.max(0, prev - 1));
        }
      },
      realMode ? 1000 : 1000 / demo.speed,
    );
    return () => window.clearInterval(id);
  }, [
    currentImpactCase,
    demo.autonomySeconds,
    demo.escalationSeconds,
    demo.speed,
    isVisiblePlanOpen,
    realMode,
  ]);

  useEffect(() => {
    if (remaining === 0) void answerAndGo("call");
    else if (countdown === 0) void answerAndGo("none");
  }, [remaining, countdown]);

  return (
    <>
      <AlertScreen
        remaining={remaining}
        total={totalSeconds}
        countdown={countdown}
        bandLabel={bandLabel}
        onAnswer={(answer) => void answerAndGo(answer)}
      />
      {submitError ? (
        <p
          role="alert"
          className="absolute right-4 bottom-4 left-4 z-50 rounded-[14px] bg-crit px-4 py-3 text-center t-note-sm font-semibold text-white"
        >
          {submitError}
        </p>
      ) : null}
      {plan ? (
        <AiResponsePlanDialog open={isPlanOpen} onOpenChange={setIsPlanOpen} plan={plan} />
      ) : null}
    </>
  );
}
