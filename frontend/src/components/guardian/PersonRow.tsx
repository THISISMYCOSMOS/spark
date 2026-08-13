export type PersonStatus = "ok" | "wait" | "no";

export type PersonRowProps = {
  rank: number | string;
  name: string;
  desc?: string | undefined;
  status?: PersonStatus | undefined;
  statusLabel?: string | undefined;
};

const PILL: Record<PersonStatus, string> = {
  ok: "bg-safe-bg text-safe border-safe-line",
  wait: "bg-wash text-dim border-line",
  no: "bg-crit-bg text-crit border-crit/30",
};

const DEFAULT_LABEL: Record<PersonStatus, string> = {
  ok: "연결됨",
  wait: "대기",
  no: "응답 없음",
};

/** 순위 뱃지 + 이름 + 상태 알약 */
export function PersonRow({ rank, name, desc, status = "wait", statusLabel }: PersonRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-line bg-paper px-[14px] py-3">
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-wash font-mono t-caption-sm text-ink2">
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate t-input font-semibold text-ink">{name}</span>
        {desc ? <span className="block truncate t-caption-xs text-dim">{desc}</span> : null}
      </span>
      <span
        className={`shrink-0 rounded-full border px-2.5 py-1 t-micro font-semibold ${PILL[status]}`}
      >
        {statusLabel ?? DEFAULT_LABEL[status]}
      </span>
    </div>
  );
}
