import type { Tone } from "./BigButton";

interface EcgMonitorProps {
  /** 심박수 (bpm) */
  bpm: number;
  /** 산소포화도 (%) */
  spo2: number;
  /** 상태 색조 */
  tone?: Tone;
}

/** 심전도 한 박자 파형 좌표 (가로 100, 세로 60 기준) */
const BEAT: [number, number][] = [
  [0, 30],
  [14, 30],
  [18, 24],
  [22, 34],
  [26, 30],
  [38, 30],
  [42, 12],
  [46, 52],
  [50, 18],
  [54, 30],
  [68, 30],
  [74, 25],
  [80, 30],
  [100, 30],
];

/** 파형을 여러 박자로 이어 붙입니다 */
function beats(count: number) {
  const points: string[] = [];
  for (let i = 0; i < count; i += 1) {
    for (const [x, y] of BEAT) {
      points.push(`${x + i * 100},${y}`);
    }
  }
  return `M${points.join(" L")}`;
}

const toneLabel: Record<Tone, string> = {
  safe: "정상 범위",
  warn: "주의 범위",
  crit: "위험 범위",
};

const toneChipClass: Record<Tone, string> = {
  safe: "bg-safe text-paper",
  warn: "bg-warn text-paper",
  crit: "bg-crit text-paper",
};

/**
 * 병원 환자 모니터와 같은 방식으로 심전도 파형과 수치를 보여줍니다.
 * 파형 흐름 속도는 심박수를 따르고, prefers-reduced-motion이 켜져 있으면 멈춥니다.
 */
export function EcgMonitor({ bpm, spo2, tone = "safe" }: EcgMonitorProps) {
  // 한 박자 = 60/bpm 초, 화면에 4박자가 보이도록 맞춥니다.
  const cycleSeconds = Math.max(1.2, (60 / Math.max(30, bpm)) * 4);

  return (
    <section
      className="overflow-hidden rounded-[20px] bg-lock-bg"
      aria-label={`환자 모니터. 심박수 분당 ${bpm}회, 산소포화도 ${spo2} 퍼센트`}
    >
      <div className="flex items-center justify-between px-[18px] pt-4">
        <span className="t-caption font-semibold tracking-[0.08em] text-paper/70">
          PATIENT MONITOR
        </span>
        <span
          className={`rounded-full px-2.5 py-1 t-caption-xs font-semibold ${toneChipClass[tone]}`}
        >
          {toneLabel[tone]}
        </span>
      </div>

      {/* 심전도 파형 */}
      <div className="relative mt-3 h-[96px] overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--mon-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--mon-grid) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          aria-hidden="true"
        />
        <div
          className="flex h-full w-[200%] motion-safe:animate-ecg-scroll"
          style={{ animationDuration: `${cycleSeconds}s` }}
          aria-hidden="true"
        >
          {[0, 1].map((i) => (
            <svg
              key={i}
              viewBox="0 0 400 60"
              preserveAspectRatio="none"
              className="h-full w-1/2 shrink-0"
            >
              <path
                d={beats(4)}
                fill="none"
                stroke="var(--mon-ecg)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ))}
        </div>
      </div>

      {/* 수치 */}
      <div className="grid grid-cols-2 gap-3 px-[18px] pb-5 pt-1">
        <div className="min-w-0">
          <div className="t-caption font-semibold tracking-[0.06em] text-mon-ecg">ECG · HR</div>
          <div className="flex items-baseline gap-1.5">
            <span className="t-metric-xl font-bold leading-tight text-mon-ecg">{bpm}</span>
            <span className="t-copy-sm font-medium text-mon-ecg/80">bpm</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="t-caption font-semibold tracking-[0.06em] text-mon-spo2">SpO₂</div>
          <div className="flex items-baseline gap-1.5">
            <span className="t-metric-xl font-bold leading-tight text-mon-spo2">{spo2}</span>
            <span className="t-copy-sm font-medium text-mon-spo2/80">%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
