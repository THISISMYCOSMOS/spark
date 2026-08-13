import type { ButtonHTMLAttributes } from "react";

export type ToggleSwitchProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
};

/** 48 x 28 토글 스위치 */
export function ToggleSwitch({ checked, onCheckedChange, label, ...rest }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/30 ${
        checked ? "bg-safe" : "bg-line"
      }`}
      {...rest}
    >
      <span
        className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-paper shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
