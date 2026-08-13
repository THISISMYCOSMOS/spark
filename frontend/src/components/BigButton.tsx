import { type ReactNode } from "react";

export type Tone = "safe" | "warn" | "crit";

interface BigButtonProps {
  title: ReactNode;
  description?: ReactNode;
  variant?: Tone;
  center?: boolean;
  as?: "button" | "a";
  href?: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const toneClass: Record<Tone, string> = {
  safe: "bg-safe",
  warn: "bg-warn",
  crit: "bg-crit",
};

export function BigButton({
  title,
  description,
  variant = "safe",
  center = false,
  as = "button",
  href,
  onClick,
  className = "",
  disabled = false,
}: BigButtonProps) {
  const classes = `inline-block w-full rounded-[18px] p-6 text-left transition-opacity active:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/40 focus-visible:ring-offset-2 ${toneClass[variant]} ${className}`;

  const content = (
    <>
      <span
        className={`block t-heading-lg font-bold leading-tight text-white ${
          center ? "text-center" : ""
        }`}
      >
        {title}
      </span>
      {description ? (
        <span className="mt-2 block t-copy font-normal leading-normal text-white/90">
          {description}
        </span>
      ) : null}
    </>
  );

  if (as === "a") {
    return (
      <a href={href} className={classes} onClick={onClick} role="button">
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}
