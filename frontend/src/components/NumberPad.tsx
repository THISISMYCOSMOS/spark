interface NumberPadProps {
  onKey: (digit: string) => void;
  onDelete: () => void;
  className?: string;
}

const keyBase =
  "h-[74px] rounded-[14px] bg-[#ECF0F5] font-bold text-ink transition-colors active:bg-line focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/40 focus-visible:ring-offset-2";

export function NumberPad({ onKey, onDelete, className = "" }: NumberPadProps) {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className={`grid grid-cols-3 gap-[10px] ${className}`}>
      {digits.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onKey(d)}
          className={`${keyBase} t-heading-xl`}
        >
          {d}
        </button>
      ))}
      <span className="h-[74px]" aria-hidden="true" />
      <button type="button" onClick={() => onKey("0")} className={`${keyBase} t-heading-xl`}>
        0
      </button>
      <button type="button" onClick={onDelete} className={`${keyBase} t-title-sm`}>
        지움
      </button>
    </div>
  );
}
