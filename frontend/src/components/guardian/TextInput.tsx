import type { ComponentPropsWithRef } from "react";

export type TextInputProps = ComponentPropsWithRef<"input">;

/** 보호자 화면 입력칸 */
export function TextInput({ className = "", ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      className={`h-[50px] w-full min-w-0 rounded-[12px] border-[1.5px] border-field-line bg-paper px-[15px] t-input text-ink placeholder:text-mute focus:border-safe focus:shadow-[0_0_0_3px_var(--safe-line)] focus:outline-none ${className}`}
    />
  );
}
