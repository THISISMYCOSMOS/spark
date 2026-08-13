import { Check, Sparkles } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AiResponsePlan } from "@/data/mock";

interface AiResponsePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: AiResponsePlan;
}

export function AiResponsePlanDialog({ open, onOpenChange, plan }: AiResponsePlanDialogProps) {
  const sourceLabel = plan.narrativeSource === "AI" ? "AI 맞춤 안내" : "안전 규칙 안내";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[360px] gap-0 overflow-y-auto rounded-[26px] border-0 bg-paper p-0 shadow-[0_28px_70px_rgba(11,16,23,0.32)]">
        <DialogHeader className="space-y-0 bg-safe px-6 pt-7 pb-6 text-left text-white">
          <div className="mb-4 flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1.5">
            <Sparkles size={16} aria-hidden="true" />
            <span className="t-caption-sm font-semibold">{sourceLabel}</span>
          </div>
          <DialogTitle className="t-heading-lg font-bold leading-[1.25] tracking-normal text-white">
            지금 해야 할 일을
            <br />
            정리했어요
          </DialogTitle>
          <DialogDescription className="mt-2 t-copy font-medium leading-[1.5] text-white/85">
            등록된 기기와 남은 시간을 바탕으로 만든 대응 안내입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-6">
          <p className="t-body-sm font-semibold leading-[1.6] text-ink">{plan.narrative}</p>

          <ol className="mt-5 flex flex-col gap-3" aria-label="AI 대응 순서">
            {plan.actions.map((action, index) => (
              <li key={action.code} className="flex items-start gap-3 rounded-[14px] bg-wash p-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-safe font-mono t-caption-sm font-bold text-white">
                  {index + 1}
                </span>
                <span className="pt-0.5 t-copy font-medium leading-[1.5] text-ink">
                  {action.instructionKo}
                </span>
              </li>
            ))}
          </ol>

          {plan.reviewRequired ? (
            <p className="mt-4 rounded-[12px] bg-warn-bg px-3.5 py-3 t-caption-sm font-medium leading-[1.5] text-warn">
              AI가 정리한 참고 안내입니다. 화면 아래의 상태 응답을 꼭 선택해 주세요.
            </p>
          ) : null}

          <DialogClose asChild>
            <button
              type="button"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[16px] bg-ink px-5 py-4 t-body font-bold text-white transition-opacity active:opacity-85"
            >
              <Check size={20} aria-hidden="true" />
              확인하고 응답하기
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
