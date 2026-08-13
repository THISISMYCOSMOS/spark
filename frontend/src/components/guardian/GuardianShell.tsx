import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { StepProgress } from "./StepProgress";

export type GuardianShellProps = {
  /** 네비게이션 가운데 제목 */
  title?: string;
  /** 네비게이션 우측 뱃지 */
  tag?: ReactNode;
  /** 상태바 좌측 시각 */
  time?: string;
  /** 상태바 우측 네트워크 표시 */
  network?: string;
  /** 뒤로가기 버튼 동작. 없으면 버튼 자리만 비웁니다 */
  onBack?: () => void;
  /** 등록 화면 진행 단계 (1~5). 없으면 진행 막대를 그리지 않습니다 */
  progress?: number;
  children: ReactNode;
};

/**
 * 보호자 화면 전용 폰 프레임.
 * 400 x 812 고정, 430px 이하에서는 전체 화면.
 */
export function GuardianShell({
  title,
  tag,
  time = "9:41",
  network = "LTE",
  onBack,
  progress,
  children,
}: GuardianShellProps) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-shell max-[430px]:block max-[430px]:min-h-0">
      <div className="flex h-[812px] w-[400px] flex-col overflow-hidden rounded-[30px] bg-paper motion-safe:animate-screen-flash shadow-[0_25px_50px_-12px_rgba(11,16,23,0.16)] max-[430px]:h-[100vh] max-[430px]:h-[100dvh] max-[430px]:w-full max-[430px]:rounded-none max-[430px]:shadow-none">
        {/* 상태바 */}
        <div className="flex h-8 shrink-0 items-center justify-between px-[22px] font-mono t-micro text-mute">
          <span>{time}</span>
          <span>{network}</span>
        </div>

        {/* 네비게이션 */}
        <div className="grid h-[58px] shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line px-[22px]">
          <div className="flex min-w-9 items-center justify-start">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="뒤로 가기"
                className="flex h-9 w-9 items-center justify-center rounded-[11px] border-[1.5px] border-line text-ink2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/30"
              >
                <ChevronLeft size={18} />
              </button>
            ) : null}
          </div>
          <div className="min-w-0 truncate text-center t-copy-sm font-semibold text-ink">
            {title}
          </div>
          <div className="flex min-w-9 items-center justify-end">{tag}</div>
        </div>

        {/* 진행 막대 */}
        <StepProgress progress={progress} />

        {/* 본문 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[22px] pb-6 pt-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/** 본문 하단 버튼 묶음 위에 넣는 여백 요소 */
export function GuardianSpacer() {
  return <div className="min-h-5 flex-1" />;
}
