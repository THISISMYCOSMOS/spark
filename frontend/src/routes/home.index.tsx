import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { TimeCard } from "@/components/TimeCard";
import { BigButton } from "@/components/BigButton";
import { LineButton } from "@/components/LineButton";
import { contacts, devices, readiness } from "@/data/mock";
import { useOutageRedirect } from "@/hooks/useOutageFlow";

export const Route = createFileRoute("/home/")({
  head: () => ({
    meta: [
      { title: "홈 · 정전 안심 케어" },
      { name: "description", content: "홈 화면 - 정전 취약가구 안심 케어 앱 프로토타입." },
      { property: "og:title", content: "홈 · 정전 안심 케어" },
      { property: "og:description", content: "홈 화면 - 정전 취약가구 안심 케어 앱 프로토타입." },
    ],
  }),
  component: Page,
});

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  return `${minutes}분`;
}

function Page() {
  // 정전이 발생하면(mode: 'outage') 긴급 확인 화면으로 자동 이동합니다.
  useOutageRedirect("outage", "/alert");

  const guardian = contacts[0];
  const battery = devices.find((d) => d.id === "battery");
  const overdueItem = readiness.find((r) => r.status === "overdue");

  return (
    <PhoneShell>
      <TopBand variant="safe" label="오늘도 이상 없습니다" />
      <Pad>
        <h1 className="t-metric font-bold leading-tight text-ink">
          지금은
          <br />
          안전합니다
        </h1>

        <TimeCard
          label="전기가 끊겨도 버틸 수 있는 시간"
          value={battery?.runtimeSeconds ? formatDuration(battery.runtimeSeconds) : "3시간 20분"}
          filled={8}
          tone="safe"
          footnote="배터리가 가득 차 있습니다"
        />

        {overdueItem ? (
          <div className="rounded-[18px] bg-warn-bg p-5">
            <p className="t-body-sm font-medium text-warn">한 가지만 해두세요</p>
            <p className="mt-2 t-title font-bold leading-snug text-warn">
              {overdueItem.label}한 지
              <br />
              {overdueItem.note}습니다
            </p>
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3">
          <BigButton
            as="a"
            href={`tel:${guardian?.phone ?? ""}`}
            title="보호자에게 전화하기"
            variant="safe"
            center
          />
          <Link to="/home/devices">
            <LineButton>내 기계 보기</LineButton>
          </Link>
        </div>
      </Pad>
    </PhoneShell>
  );
}
