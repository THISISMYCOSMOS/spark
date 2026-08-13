import type { ReactNode } from "react";
import { PhoneShell } from "./PhoneShell";
import { TopBand } from "./TopBand";
import { Pad } from "./Pad";
import { VitalCard } from "./VitalCard";
import { EcgMonitor } from "./EcgMonitor";
import type { Tone } from "./BigButton";

interface VitalItem {
  label: ReactNode;
  value: ReactNode;
  usual: ReactNode;
  verdict: ReactNode;
  tone: Tone;
}

interface VitalsPageProps {
  /** 페이지 전체 색조 (TopBand, 안내 박스에 적용) */
  tone: Tone;
  /** TopBand 문구 */
  topBandLabel: string;
  /** 제목 (줄바꿈은 <br />로 전달) */
  title: ReactNode;
  /** 숨 쉬는 상태 카드 */
  breath: VitalItem;
  /** 심장 뛰는 빠르기 카드 */
  pulse: VitalItem;
  /** 안내 박스 문구 */
  guide: ReactNode;
  /** 병원 모니터 수치 (심박수 bpm, 산소포화도 %) */
  monitor: { bpm: number; spo2: number };
}

const guideBgClass: Record<Tone, string> = {
  safe: "bg-wash text-ink",
  warn: "bg-warn-bg text-warn",
  crit: "bg-crit-bg text-crit",
};

export function VitalsPage({
  tone,
  topBandLabel,
  title,
  breath,
  pulse,
  guide,
  monitor,
}: VitalsPageProps) {
  return (
    <PhoneShell>
      <TopBand variant={tone} label={topBandLabel} />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-tight text-ink">{title}</h1>

        <EcgMonitor bpm={monitor.bpm} spo2={monitor.spo2} tone={tone} />

        <div className="flex flex-col gap-4">
          <VitalCard
            label={breath.label}
            value={breath.value}
            usual={breath.usual}
            verdict={breath.verdict}
            tone={breath.tone}
          />
          <VitalCard
            label={pulse.label}
            value={pulse.value}
            usual={pulse.usual}
            verdict={pulse.verdict}
            tone={pulse.tone}
          />
        </div>

        <div
          className={`rounded-[18px] p-5 t-body-lg font-semibold leading-[150%] ${guideBgClass[tone]}`}
        >
          {guide}
        </div>
      </Pad>
    </PhoneShell>
  );
}
