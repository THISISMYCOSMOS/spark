import type { ReactNode } from "react";
import type { Tone } from "./BigButton";

interface TimeCardProps {
  label: ReactNode;
  value: ReactNode;
  filled: number;
  tone?: Tone;
  footnote?: ReactNode;
  className?: string;
}

const toneFill: Record<Tone, string> = {
  safe: "bg-safe",
  warn: "bg-warn",
  crit: "bg-crit",
};

export function TimeCard({
  label,
  value,
  filled,
  tone = "safe",
  footnote,
  className = "",
}: TimeCardProps) {
  const count = Math.max(0, Math.min(8, filled));

  return (
    <div className={`rounded-[20px] border-2 border-line bg-wash p-[22px] ${className}`}>
      <div className="t-body-sm font-medium text-dim">{label}</div>
      <div className="mt-1 t-metric-lg font-bold leading-tight text-ink">{value}</div>
      <div className="mt-3 flex gap-[5px]" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className={`h-4 flex-1 rounded-[4px] ${i < count ? toneFill[tone] : "bg-[#D2DAE4]"}`}
          />
        ))}
      </div>
      {footnote ? <div className="mt-3 t-body-sm font-normal text-dim">{footnote}</div> : null}
    </div>
  );
}
