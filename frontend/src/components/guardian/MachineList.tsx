import { Check } from "lucide-react";
import type { MedicalDevice } from "@/contexts/GuardianContext";

export type MachineListProps = {
  devices: MedicalDevice[];
  selected: string[];
  onToggle: (id: string) => void;
};

/** 기계 선택 카드 목록 */
export function MachineList({ devices, selected, onToggle }: MachineListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {devices.map((device) => {
        const on = selected.includes(device.id);
        return (
          <button
            key={device.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(device.id)}
            className={`flex items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-[15px] text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/30 ${
              on ? "border-safe bg-safe-bg" : "border-line bg-paper"
            }`}
          >
            <span
              className={`pointer-events-none flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] ${
                on ? "border-safe bg-safe text-paper" : "border-field-line bg-paper"
              }`}
            >
              {on ? <Check size={15} strokeWidth={3} className="pointer-events-none" /> : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`t-copy font-semibold ${on ? "text-safe" : "text-ink"}`}>
                {device.name}
              </span>
              <span className="font-mono t-caption-sm text-dim">{device.watt}W</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
