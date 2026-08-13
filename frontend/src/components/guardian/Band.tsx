export type BandVariant = "safe" | "warn" | "crit";

export type BandProps = {
  variant?: BandVariant | undefined;
  live?: boolean | undefined;
  children: React.ReactNode;
};

const STYLE: Record<BandVariant, { box: string; dot: string }> = {
  safe: { box: "bg-safe-bg border-safe-line text-safe", dot: "bg-safe" },
  warn: { box: "bg-warn-bg border-warn-line text-warn", dot: "bg-warn" },
  crit: { box: "bg-crit-bg border-crit/30 text-crit", dot: "bg-crit" },
};

/** 상단 알림 띠 */
export function Band({ variant = "safe", live = false, children }: BandProps) {
  const s = STYLE[variant];
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[12px] border-[1.5px] px-[14px] py-3 ${s.box}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${s.dot} ${
          live ? "motion-safe:animate-guardian-blink" : ""
        }`}
      />
      <span className="t-note-sm font-semibold">{children}</span>
    </div>
  );
}
