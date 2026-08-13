import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { emergencyNumber, messages, patient } from "@/data/mock";

export const Route = createFileRoute("/after/dial")({
  head: () => ({
    meta: [
      { title: "119 전화 걸기 · 정전 안심 케어" },
      { name: "description", content: "시연용 119 전화 다이얼 화면입니다." },
      { property: "og:title", content: "119 전화 걸기 · 정전 안심 케어" },
      { property: "og:description", content: "시연용 119 전화 다이얼 화면입니다." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();

  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col items-center justify-center bg-lock-bg px-6 py-10 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="t-display font-semibold leading-tight text-white">{emergencyNumber}</div>
          <p className="t-body-sm font-normal text-white/60">통화 버튼을 누르세요</p>
        </div>

        <div className="mt-10 max-w-[280px] rounded-2xl bg-white/12 p-5">
          <p className="t-copy font-normal leading-[170%] text-white">
            {patient.address}
            <br />
            {messages.emergencySituation}
            <br />
            {patient.name} {patient.age}세 · {patient.condition}
          </p>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => navigate({ to: "/after/done" })}
            className="flex h-[88px] w-[88px] items-center justify-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:ring-offset-4 focus-visible:ring-offset-lock-bg"
            style={{ backgroundColor: "#12A150" }}
            aria-label={`${emergencyNumber} 통화 연결`}
          >
            <Phone size={36} strokeWidth={2.5} fill="currentColor" />
          </button>

          <button
            type="button"
            onClick={() => navigate({ to: "/after/call" })}
            className="t-copy font-normal text-white/60 transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-lock-bg rounded-sm px-2 py-1"
          >
            취소
          </button>
        </div>
      </div>
    </PhoneShell>
  );
}
