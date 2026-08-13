import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export type RoleCardVariant = "safe" | "dark";

interface RoleCardProps {
  to: string;
  title: string;
  description: ReactNode;
  variant?: RoleCardVariant;
}

const variantClass: Record<RoleCardVariant, string> = {
  safe: "bg-safe",
  dark: "bg-[#2E3C4D]",
};

export function RoleCard({ to, title, description, variant = "safe" }: RoleCardProps) {
  return (
    <Link
      to={to}
      className={`flex w-full flex-col gap-3.5 rounded-[20px] px-6 py-[30px] text-white transition-opacity active:opacity-90 focus-visible:outline-none ${variantClass[variant]}`}
    >
      <span className="t-heading-2xl font-bold leading-tight">{title}</span>
      <span className="t-body-sm font-normal leading-normal text-white/90">{description}</span>
    </Link>
  );
}
