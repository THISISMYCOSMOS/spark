import type { ReactNode } from "react";

export type FieldProps = {
  label: string;
  help?: string | undefined;
  /** true면 입력칸들을 가로로 나란히 배치합니다 */
  row?: boolean | undefined;
  children: ReactNode;
};

/** 라벨 + 입력칸 묶음 */
export function Field({ label, help, row = false, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="t-note-sm font-semibold text-ink2">{label}</span>
      <div className={row ? "flex items-center gap-2" : "flex flex-col gap-2"}>{children}</div>
      {help ? <span className="t-caption-sm text-mute">{help}</span> : null}
    </div>
  );
}
