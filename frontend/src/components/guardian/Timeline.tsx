export type TimelineStatus = "done" | "now" | "auto" | "wait";

export type TimelineItem = {
  time: string;
  title: string;
  desc?: string;
  status?: TimelineStatus;
};

const COLOR: Record<TimelineStatus, string> = {
  done: "text-safe",
  now: "text-warn",
  auto: "text-crit",
  wait: "text-mute",
};

/** 시각 + 내용 타임라인 */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="rounded-[14px] border-[1.5px] border-line bg-paper">
      {items.map((item, i) => (
        <li
          key={`${item.time}-${i}`}
          className={`flex gap-3 px-4 py-3 ${i < items.length - 1 ? "border-b border-line" : ""}`}
        >
          <span
            className={`w-[38px] shrink-0 pt-0.5 font-mono t-micro ${COLOR[item.status ?? "wait"]}`}
          >
            {item.time}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block t-note font-semibold ${COLOR[item.status ?? "wait"]}`}>
              {item.title}
            </span>
            {item.desc ? (
              <span className="mt-0.5 block t-caption-sm leading-[1.5] text-dim">{item.desc}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
