import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export type TopBandVariant = "crit" | "warn" | "safe" | "none";

interface TopBandProps {
  variant: TopBandVariant;
  label: ReactNode;
  live?: boolean;
  /** 상단 왼쪽 뒤로 가기 버튼 표시 여부 */
  back?: boolean;
}

const variantClass: Record<Exclude<TopBandVariant, "none">, string> = {
  crit: "bg-crit",
  warn: "bg-warn",
  safe: "bg-safe",
};

export function TopBand({ variant, label, live = false, back = true }: TopBandProps) {
  const router = useRouter();
  if (variant === "none") return null;

  return (
    <div
      className={`flex items-center justify-between px-6 pt-[22px] pb-5 ${variantClass[variant]}`}
    >
      <span className="flex items-center gap-3">
        {back ? (
          <button
            type="button"
            onClick={() => router.history.back()}
            aria-label="뒤로 가기"
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            <ChevronLeft size={24} strokeWidth={2.5} />
          </button>
        ) : null}
        <span
          className={`inline-block h-[14px] w-[14px] rounded-full bg-white ${
            live ? "motion-safe:animate-pulse-live" : ""
          }`}
          aria-hidden="true"
        />
      </span>
      <span className="t-body-lg font-semibold leading-tight text-white">{label}</span>
    </div>
  );
}
