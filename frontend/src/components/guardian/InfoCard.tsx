import type { ReactNode } from "react";

export type InfoTone = "safe" | "warn" | "crit" | "none";

export type InfoCardProps = {
  title: ReactNode;
  tone?: InfoTone | undefined;
  children?: ReactNode;
};

const TONE: Record<InfoTone, { box: string; title: string; body: string }> = {
  none: { box: "bg-paper border-line", title: "text-ink", body: "text-dim" },
  safe: { box: "bg-safe-bg border-safe-line", title: "text-safe", body: "text-safe/80" },
  warn: { box: "bg-warn-bg border-warn-line", title: "text-warn", body: "text-warn/80" },
  crit: { box: "bg-crit-bg border-crit/30", title: "text-crit", body: "text-crit/80" },
};

/** 보호자 화면 안내 카드 */
export function InfoCard({ title, tone = "none", children }: InfoCardProps) {
  const t = TONE[tone];
  return (
    <div className={`rounded-[14px] border-[1.5px] p-4 ${t.box}`}>
      <p className={`t-copy-sm font-semibold ${t.title}`}>{title}</p>
      {children ? (
        <div className={`mt-1.5 t-note-sm font-normal leading-[1.55] ${t.body}`}>{children}</div>
      ) : null}
    </div>
  );
}
