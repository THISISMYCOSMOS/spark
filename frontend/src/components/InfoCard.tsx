import type { ReactNode } from "react";

interface InfoCardProps {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function InfoCard({ title, children, className = "" }: InfoCardProps) {
  return (
    <div className={`rounded-[18px] border-2 border-line bg-paper p-[22px] ${className}`}>
      <h3 className="t-subheading-sm font-bold text-ink">{title}</h3>
      {children ? (
        <p className="mt-2 t-body-sm font-normal leading-[150%] text-dim">{children}</p>
      ) : null}
    </div>
  );
}
