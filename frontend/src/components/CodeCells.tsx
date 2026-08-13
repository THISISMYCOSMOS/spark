interface CodeCellsProps {
  value: string;
  length?: number;
  className?: string;
}

export function CodeCells({ value, length = 6, className = "" }: CodeCellsProps) {
  return (
    <div className={`flex justify-center gap-2 ${className}`}>
      {Array.from({ length }).map((_, i) => {
        const char = value[i];
        return (
          <span
            key={i}
            className={`flex h-[62px] w-[46px] items-center justify-center rounded-xl t-heading-sm font-bold text-ink ${
              char ? "border-[3px] border-safe bg-paper" : "border-2 border-line bg-wash"
            }`}
          >
            {char ?? ""}
          </span>
        );
      })}
    </div>
  );
}
