export type AddButtonProps = {
  onClick?: (() => void) | undefined;
  children: React.ReactNode;
};

/** 점선 테두리 추가 버튼 */
export function AddButton({ onClick, children }: AddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[12px] border-[1.5px] border-dashed border-safe-line p-[14px] text-center t-input font-semibold text-safe focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/30"
    >
      {children}
    </button>
  );
}
