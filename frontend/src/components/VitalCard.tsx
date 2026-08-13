import type { ReactNode } from "react";
import type { Tone } from "./BigButton";

interface VitalCardProps {
  label: ReactNode;
  value: ReactNode;
  usual?: ReactNode;
  verdict?: ReactNode;
  tone?: Tone;
  className?: string;
}

const toneClass: Record<Tone, string> = {
  safe: "bg-safe-bg border-safe-line text-safe",
  warn: "bg-warn-bg border-warn-line text-warn",
  crit: "bg-crit-bg border-crit text-crit",
};

export function VitalCard({
  label,
  value,
  usual,
  verdict,
  tone = "safe",
  className = "",
}: VitalCardProps) {
  return (
    <div className={`rounded-[20px] border-2 p-[22px] ${toneClass[tone]} ${className}`}>
      <div className="t-body font-medium text-dim">{label}</div>
      <div className="t-metric-2xl font-bold leading-tight">{value}</div>
      {usual ? <div className="t-body font-normal text-dim">{usual}</div> : null}
      {verdict ? <div className="mt-2 t-title-sm font-bold">{verdict}</div> : null}
    </div>
  );
}
