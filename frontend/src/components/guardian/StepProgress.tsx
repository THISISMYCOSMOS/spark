export type StepProgressProps = {
  /** 현재 단계 (1~5). 없으면 렌더링하지 않습니다 */
  progress?: number | undefined;
  total?: number | undefined;
};

/** 5칸 진행 막대 */
export function StepProgress({ progress, total = 5 }: StepProgressProps) {
  if (!progress) return null;

  return (
    <div className="h-4 shrink-0 px-[22px] pt-3">
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={progress}
        aria-label="등록 진행 단계"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-[2px] ${i < progress ? "bg-safe" : "bg-empty"}`}
          />
        ))}
      </div>
    </div>
  );
}
