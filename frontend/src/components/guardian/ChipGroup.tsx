export type ChipOption = {
  id: string;
  label: string;
};

export type ChipGroupProps = {
  options: ChipOption[];
  selected: string[];
  onToggle: (id: string) => void;
};

/** 줄바꿈되는 다중 선택 칩 그룹 */
export function ChipGroup({ options, selected, onToggle }: ChipGroupProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(opt.id)}
            className={`rounded-full border-[1.5px] px-4 py-[11px] t-input transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/30 ${
              on
                ? "border-safe bg-safe-bg font-semibold text-safe"
                : "border-line font-medium text-ink2"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
