export type ActionItem = {
  id: string;
  title: string;
  desc?: string;
};

export type ActionGridProps = {
  items: ActionItem[];
  selected?: string[] | undefined;
  onToggle?: ((id: string) => void) | undefined;
};

/** 2열 선택 격자 */
export function ActionGrid({ items, selected = [], onToggle }: ActionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle?.(item.id)}
            className={`rounded-[14px] border-[1.5px] px-[14px] py-[15px] text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/30 ${
              on ? "border-safe bg-safe-bg" : "border-line bg-paper"
            }`}
          >
            <span className={`block t-copy-sm font-semibold ${on ? "text-safe" : "text-ink"}`}>
              {item.title}
              {on ? " ✓" : ""}
            </span>
            {item.desc ? (
              <span className="mt-1 block t-micro leading-[1.5] text-dim">{item.desc}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
