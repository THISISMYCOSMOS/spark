import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { AlertScreen } from "@/components/AlertScreen";
import { useApp, type AlertAnswer } from "@/contexts/AppContext";
import { useOutageInfo, useOutageRedirect } from "@/hooks/useOutageFlow";
import { useOutage } from "@/contexts/OutageContext";

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
  const { setPatientAnswer } = useOutage();

  // 정전이 끝나면(mode: 'calm') 마무리 화면으로 이동합니다.
  useOutageRedirect("calm", "/after/done", true);

  const totalSeconds = demo.autonomySeconds;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [countdown, setCountdown] = useState(demo.escalationSeconds);

  const answeredRef = useRef(false);

  const answerAndGo = (answer: Exclude<AlertAnswer, null>) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setAnswer(answer);
    setPatientAnswer(answer);
    setAlertSnapshot({ remaining, countdown });
    navigate({ to: "/alert/sent" });
  };

  // 화면에 들어온 순간 시작하고, 벗어나면 정지합니다.
  useEffect(() => {
    setRemaining(demo.autonomySeconds);
  }, [demo.autonomySeconds]);

  useEffect(() => {
    setCountdown((prev) => Math.min(prev, demo.escalationSeconds));
  }, [demo.escalationSeconds]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000 / demo.speed);
    return () => window.clearInterval(id);
  }, [demo.speed]);

  useEffect(() => {
    if (remaining === 0) answerAndGo("call");
    else if (countdown === 0) answerAndGo("none");
  }, [remaining, countdown]);

  return (
    <AlertScreen
      remaining={remaining}
      total={totalSeconds}
      countdown={countdown}
      bandLabel={bandLabel}
      onAnswer={answerAndGo}
    />
  );
}
