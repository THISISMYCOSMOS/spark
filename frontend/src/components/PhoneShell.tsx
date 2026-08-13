import type { ReactNode } from "react";

export function PhoneShell({
  children,
  flash = false,
  time = "9:41",
  network = "LTE",
}: {
  children: ReactNode;
  /** 화면이 바뀔 때 한 번 짧은 강조 효과 (prefers-reduced-motion 존중) */
  flash?: boolean;
  /** 상태바 좌측 시각 */
  time?: string;
  /** 상태바 우측 네트워크 표시 */
  network?: string;
}) {
  return (
    <div className="min-h-[100dvh] bg-wash px-6 py-8 flex items-center justify-center max-[430px]:px-0 max-[430px]:pt-0 max-[430px]:pb-4 max-[430px]:items-stretch">
      <div className="flex w-full max-w-[400px] flex-col max-[430px]:max-w-none max-[430px]:flex-1">
        <div
          className={`relative flex h-[812px] w-[400px] shrink-0 flex-col overflow-hidden max-[430px]:h-[100dvh] max-[430px]:w-full max-[430px]:flex-1 rounded-[30px] bg-shell shadow-[0_25px_50px_-12px_rgba(11,16,23,0.16)] max-[430px]:rounded-none max-[430px]:shadow-none ${
            flash ? "motion-safe:animate-screen-flash" : ""
          }`}
        >
          {/* 상태바 (보호자 화면과 동일) */}
          <div className="flex h-8 shrink-0 items-center justify-between bg-paper px-[22px] font-mono t-micro text-mute">
            <span>{time}</span>
            <span>{network}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
