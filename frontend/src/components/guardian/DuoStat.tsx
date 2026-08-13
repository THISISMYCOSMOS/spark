export type DuoStatTone = "ink" | "safe" | "warn" | "crit";

export type DuoStatItem = {
  label: string;
  value: string;
  tone?: DuoStatTone | undefined;
};

const VALUE_TONE: Record<DuoStatTone, string> = {
  ink: "text-ink",
  safe: "text-safe",
  warn: "text-warn",
  crit: "text-crit",
};

export type DuoStatProps = {
  left: DuoStatItem;
  right: DuoStatItem;
};

/** 두 숫자를 나란히 보여주는 카드 쌍 */
export function DuoStat({ left, right }: DuoStatProps) {
  return (
    <div className="grid grid-cols-2 items-stretch gap-2.5">
      {[left, right].map((item, i) => (
        <div
          key={i}
          className="flex h-full flex-col justify-between gap-2 rounded-[16px] border-[1.5px] border-line bg-wash px-4 py-[14px]"
        >
          <span className="t-caption min-h-[2.6em] font-medium leading-[1.3] text-dim">
            {item.label}
          </span>
          <span className={`t-subheading font-bold leading-none ${VALUE_TONE[item.tone ?? "ink"]}`}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
