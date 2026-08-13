import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { InfoCard } from "@/components/InfoCard";
import { BigButton } from "@/components/BigButton";
import { LineButton } from "@/components/LineButton";
import { useApp } from "@/contexts/AppContext";
import { contacts } from "@/data/mock";

export const Route = createFileRoute("/after/guardian")({
  head: () => ({
    meta: [
      { title: "보호자가 오고 있습니다 · 정전 안심 케어" },
      { name: "description", content: "보호자 연락 후 도착 예정 시간을 확인하는 화면입니다." },
      { property: "og:title", content: "보호자가 오고 있습니다 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "보호자 연락 후 도착 예정 시간을 확인하는 화면입니다.",
      },
    ],
  }),
  component: Page,
});

function formatDuration(total: number) {
  const s = Math.max(0, total);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function Page() {
  const navigate = useNavigate();
  const { answer, alertSnapshot, demo } = useApp();
  const guardian = contacts[0];

  const [arrival, setArrival] = useState(demo.arrivalSeconds);
  const [remaining, setRemaining] = useState(alertSnapshot?.remaining ?? demo.autonomySeconds);

  useEffect(() => {
    const id = window.setInterval(() => {
      setArrival((v) => Math.max(0, v - 1));
      setRemaining((v) => Math.max(0, v - 1));
    }, 1000 / demo.speed);
    return () => window.clearInterval(id);
  }, [demo.speed]);

  const inTime = arrival < remaining;

  return (
    <PhoneShell>
      <TopBand
        variant="warn"
        label={answer === "none" ? "응답이 없어 보호자께 대신 알렸습니다" : "보호자께 연락했습니다"}
      />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-tight text-ink">
          {guardian?.name ?? "보호자"} 님이
          <br />
          오고 있습니다
        </h1>

        <div className="grid grid-cols-2 gap-3 items-stretch">
          <div className="flex h-full flex-col rounded-[18px] border-2 border-line bg-wash p-[18px]">
            <div className="t-copy font-medium text-dim">도착까지</div>
            <div className="mt-auto pt-2 t-heading-lg font-bold leading-tight text-safe">
              {formatDuration(arrival)}
            </div>
          </div>
          <div className="flex h-full flex-col rounded-[18px] border-2 border-line bg-wash p-[18px]">
            <div className="t-copy font-medium text-dim">쓸 수 있는 시간</div>
            <div className="mt-auto pt-2 t-heading-lg font-bold leading-tight text-warn">
              {formatDuration(remaining)}
            </div>
          </div>
        </div>

        {inTime ? (
          <div className="rounded-[18px] border-2 border-safe-line bg-safe-bg p-[22px]">
            <p className="t-title font-bold leading-[140%] text-safe">
              배터리가 떨어지기 전에
              <br />
              도착합니다.
            </p>
          </div>
        ) : (
          <div className="rounded-[18px] border-2 border-crit bg-crit-bg p-[22px]">
            <p className="t-title font-bold leading-[140%] text-crit">
              도착이 늦습니다.
              <br />
              119에 전화하시는 것이 좋습니다.
            </p>
          </div>
        )}

        <InfoCard title={`${guardian?.name ?? "보호자"} 님 (${guardian?.relation ?? ""})`}>
          보조 배터리를 가지고 오는 중입니다
        </InfoCard>

        <div className="mt-auto flex flex-col gap-3">
          <BigButton
            as="a"
            href={`tel:${guardian?.phone ?? ""}`}
            variant="safe"
            center
            title={`${guardian?.name ?? "보호자"} 님께 전화하기`}
          />
          <LineButton onClick={() => navigate({ to: "/after/done" })}>
            전기가 다시 들어왔어요
          </LineButton>
        </div>
      </Pad>
    </PhoneShell>
  );
}
