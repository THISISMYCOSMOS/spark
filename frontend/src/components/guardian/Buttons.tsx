import type { ButtonHTMLAttributes } from "react";

export type PrimaryTone = "safe" | "crit" | "dark";

const TONE: Record<PrimaryTone, string> = {
  safe: "bg-safe text-paper",
  crit: "bg-crit text-paper",
  dark: "bg-ink text-paper",
};

export type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: PrimaryTone | undefined;
};

/** 주요 동작 버튼 */
export function PrimaryButton({ tone = "safe", className = "", ...rest }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`w-full rounded-[14px] px-4 py-[15px] t-action font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/25 disabled:opacity-45 ${TONE[tone]} ${className}`}
    />
  );
}

/** 보조 동작 버튼 */
export function GhostButton({ className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`w-full rounded-[13px] border-[1.5px] border-line bg-paper px-4 py-[13px] t-input font-semibold text-ink2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/20 disabled:opacity-45 ${className}`}
    />
  );
}
