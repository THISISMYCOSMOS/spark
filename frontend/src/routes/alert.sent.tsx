import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { AlertScreen } from "@/components/AlertScreen";
import { useApp, type AlertAnswer } from "@/contexts/AppContext";
import { autonomy, contacts, escalationSeconds, messages } from "@/data/mock";

export const Route = createFileRoute("/alert/sent")({
  head: () => ({
    meta: [
      { title: "알림 전송됨 · 정전 안심 케어" },
      {
        name: "description",
        content: "보호자에게 상황을 문자로 알렸습니다.",
      },
      { property: "og:title", content: "알림 전송됨 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "보호자에게 상황을 문자로 알렸습니다.",
      },
    ],
  }),
  component: Page,
});

const toneMap = {
  safe: {
    circleBg: "bg-safe-bg",
    circleBorder: "border-safe-line",
    icon: "text-safe",
    button: "bg-safe",
    ring: "focus:ring-safe",
  },
  warn: {
    circleBg: "bg-warn-bg",
    circleBorder: "border-warn-line",
    icon: "text-warn",
    button: "bg-warn",
    ring: "focus:ring-warn",
  },
  crit: {
    circleBg: "bg-crit-bg",
    circleBorder: "border-crit",
    icon: "text-crit",
    button: "bg-crit",
    ring: "focus:ring-crit",
  },
};

function answerTone(answer: AlertAnswer): "safe" | "warn" | "crit" {
  if (answer === "ok") return "safe";
  if (answer === "call") return "crit";
  return "warn";
}

function nextPath(answer: AlertAnswer): string {
  if (answer === "ok") return "/after/ok";
  if (answer === "guardian") return "/after/guardian";
  if (answer === "call") return "/after/call";
  return "/after/guardian";
}

function Page() {
  const navigate = useNavigate();
  const { answer, alertSnapshot, alertSentSeen, setAlertSentSeen } = useApp();
  const dismissedRef = useRef(false);

  const remaining = alertSnapshot?.remaining ?? autonomy.outageSeconds;
  const countdown = alertSnapshot?.countdown ?? escalationSeconds;

  const tone = answerTone(answer);
  const classes = toneMap[tone];
  const primaryContact = contacts.find((c) => c.priority === 1)!;

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setAlertSentSeen(true);
    navigate({ to: nextPath(answer) });
  };

  // 팝업을 닫은 적이 있으면 바로 이동합니다.
  useEffect(() => {
    if (alertSentSeen) {
      if (answer) navigate({ to: nextPath(answer) });
      else navigate({ to: "/alert" });
    }
  }, [alertSentSeen, answer, navigate]);

  return (
    <div className="relative">
      <AlertScreen remaining={remaining} countdown={countdown} />

      <div
        className="absolute inset-0 flex items-center justify-center bg-black/55"
        aria-hidden="false"
      >
        <div className="flex w-[330px] flex-col items-center gap-4 rounded-[24px] bg-white px-[26px] pb-[26px] pt-[32px]">
          <div
            className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 ${classes.circleBg} ${classes.circleBorder}`}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={classes.icon}
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 className="text-center t-heading font-bold text-ink">문자를 보냈습니다</h2>

          <p className="text-center t-body-lg font-normal leading-[1.4] text-dim">
            {primaryContact.name} 님({primaryContact.relation})께
            <br />
            지금 상황을 문자로 알렸습니다.
          </p>

          <div className="w-full rounded-[14px] bg-wash p-[18px]">
            <p className="mb-2 t-note font-medium text-dim">보낸 내용</p>
            <p className="t-copy font-semibold leading-[1.5] text-ink">
              {messages.guardianSms.map((line, i) => (
                <span key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className={`w-full rounded-[16px] py-[18px] text-center t-subheading font-bold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${classes.button} ${classes.ring}`}
          >
            알겠습니다
          </button>
        </div>
      </div>
    </div>
  );
}
