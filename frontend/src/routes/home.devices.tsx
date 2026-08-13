import { createFileRoute } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { BigButton } from "@/components/BigButton";
import { devices, autonomy, contacts } from "@/data/mock";
import type { Tone } from "@/data/mock";

export const Route = createFileRoute("/home/devices")({
  head: () => ({
    meta: [
      { title: "내 기계 · 정전 안심 케어" },
      { name: "description", content: "등록된 의료기기와 예비 배터리 상태를 확인합니다." },
      { property: "og:title", content: "내 기계 · 정전 안심 케어" },
      { property: "og:description", content: "등록된 의료기기와 예비 배터리 상태를 확인합니다." },
    ],
  }),
  component: Page,
});

const toneText: Record<Tone, string> = {
  safe: "text-safe",
  warn: "text-warn",
  crit: "text-crit",
};

const toneBg: Record<Tone, string> = {
  safe: "bg-safe-bg",
  warn: "bg-warn-bg",
  crit: "bg-crit-bg",
};

const toneBorder: Record<Tone, string> = {
  safe: "border-safe-line",
  warn: "border-warn-line",
  crit: "border-crit",
};

const deviceBadge: Record<string, string> = {
  oxygen: "켜짐",
  bed: "켜짐",
  battery: "가득",
};

function Page() {
  const totalRuntimeSeconds = autonomy.normalSeconds;
  const filled = 8; // 3시간 20분 = 8칸 가득

  return (
    <PhoneShell>
      {/* 상단 색 띠 */}
      <div className="flex items-center gap-3 bg-safe px-6 pt-5 pb-[18px]">
        <span className="h-[14px] w-[14px] rounded-full bg-white" aria-hidden="true" />
        <span className="t-body font-semibold leading-tight text-white">
          기계가 모두 잘 돌아가고 있습니다
        </span>
      </div>

      {/* 본문 */}
      <main className="flex min-h-0 flex-1 flex-col gap-[11px] overflow-y-auto bg-paper px-6 pt-[18px] pb-5">
        <h1 className="t-heading-lg font-bold text-ink">내 기계</h1>

        {/* 전체 요약 카드 */}
        <div className="rounded-[18px] border-2 border-safe-line bg-safe-bg px-5 py-[15px]">
          <p className="t-copy font-medium text-safe">지금 이대로면 이만큼 씁니다</p>
          <p className="mt-1 t-metric-md font-bold leading-tight text-safe">
            {formatDuration(totalRuntimeSeconds)}
          </p>
          <div className="mt-3 flex gap-[5px]" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={`h-3 flex-1 rounded-[4px] ${i < filled ? "bg-safe" : "bg-[#D2DAE4]"}`}
              />
            ))}
          </div>
        </div>

        {/* 기계 카드 */}
        <div className="flex flex-col gap-[11px]">
          {devices.map((device) => {
            const tone = device.statusTone ?? "safe";
            return (
              <div
                key={device.id}
                className="flex flex-col gap-[5px] rounded-[18px] border-2 border-line bg-paper px-5 py-[14px]"
              >
                <div className="flex items-center justify-between">
                  <h2 className="t-title font-bold text-ink">{device.name}</h2>
                  <span
                    className={`rounded-lg border-[1.5px] px-[11px] py-[6px] t-note font-semibold ${toneText[tone]} ${toneBg[tone]} ${toneBorder[tone]}`}
                  >
                    {deviceBadge[device.id] ?? "켜짐"}
                  </span>
                </div>
                <p className={`t-body font-semibold leading-tight ${toneText[tone]}`}>
                  {device.status}
                </p>
                <p className="t-copy-sm font-normal leading-[150%] text-dim">{device.usage}</p>
              </div>
            );
          })}
        </div>

        {/* 하단 버튼 */}
        <div className="mt-auto">
          <BigButton
            as="a"
            href={`tel:${contacts[0]?.phone ?? "010-1234-5678"}`}
            title="따님께 전화하기"
            variant="safe"
            center
          />
        </div>
      </main>
    </PhoneShell>
  );
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  return `${minutes}분`;
}
