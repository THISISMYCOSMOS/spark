import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type ActionResultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  success: boolean;
  title: string;
  description: string;
  onConfirm?: () => void;
};

export function ActionResultDialog({
  open,
  onOpenChange,
  success,
  title,
  description,
  onConfirm,
}: ActionResultDialogProps) {
  const Icon = success ? CheckCircle2 : AlertCircle;
  const close = () => {
    onOpenChange(false);
    onConfirm?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-32px)] max-w-[340px] gap-0 rounded-[24px] border-0 bg-paper p-0 text-center shadow-[0_28px_70px_rgba(11,16,23,0.32)] [&>button]:hidden">
        <div className="flex flex-col items-center px-6 pt-8 pb-6">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full ${success ? "bg-safe-bg text-safe" : "bg-crit-bg text-crit"}`}
          >
            <Icon size={34} aria-hidden="true" />
          </span>
          <DialogTitle className="mt-5 t-heading font-bold leading-tight text-ink">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-3 t-body leading-relaxed text-dim">
            {description}
          </DialogDescription>
          <button
            type="button"
            onClick={close}
            className={`mt-6 w-full rounded-[14px] px-4 py-4 t-action font-semibold text-white ${success ? "bg-safe" : "bg-crit"}`}
          >
            확인
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
