import type { ReactNode } from "react";

export function Pad({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-paper [&>*]:shrink-0 px-6 pt-[26px] pb-6">
      {children}
    </main>
  );
}
