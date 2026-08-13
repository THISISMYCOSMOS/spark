import { useApp } from "@/contexts/AppContext";

/** 시연용 속도 조절 도구. 실제 서비스에는 없습니다. */
export function DemoBar() {
  const { demo, shortenEscalation, toggleFast, batteryFirst } = useApp();

  const base =
    "rounded-full border border-line bg-paper px-3 py-1.5 t-caption-xs font-medium text-dim transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-wash";
  const active = "border-ink bg-ink text-paper hover:text-paper";

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="t-micro-sm font-medium text-dim">시연용 조절 도구 · 실제 서비스에는 없습니다</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={shortenEscalation}
          className={`${base} ${demo.escalationSeconds === 8 ? active : ""}`}
        >
          3분을 8초로
        </button>
        <button
          type="button"
          onClick={toggleFast}
          className={`${base} ${demo.speed !== 1 ? active : ""}`}
        >
          빠르게 보기{demo.speed !== 1 ? " (60배)" : ""}
        </button>
        <button
          type="button"
          onClick={batteryFirst}
          className={`${base} ${demo.autonomySeconds === 600 ? active : ""}`}
        >
          배터리가 먼저 떨어지는 경우
        </button>
      </div>
    </div>
  );
}
