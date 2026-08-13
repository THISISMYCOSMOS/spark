import type { ButtonHTMLAttributes, ReactNode } from "react";

interface LineButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function LineButton({ children, className = "", ...props }: LineButtonProps) {
  return (
    <button
      type="button"
      className={`w-full rounded-2xl border-2 border-line bg-paper px-4 py-[19px] text-center t-lead font-semibold text-ink transition-colors active:bg-wash focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/40 focus-visible:ring-offset-2 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
