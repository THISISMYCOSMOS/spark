import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { TimeCard } from "@/components/TimeCard";
import { BigButton, type Tone } from "@/components/BigButton";
import { autonomy, contacts, escalationSeconds } from "@/data/mock";
import type { AlertAnswer } from "@/contexts/AppContext";

/** 초를 "2시간 48분" 형식으로. 콜론 표기는 쓰지 않습니다. */
function formatDuration(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  return `${s % 60}초`;
}

/** 남은 응답 시간 표시 */
function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  if (minutes > 0 && seconds === 0) return `${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

function toneForRatio(ratio: number): Tone {
  if (ratio >= 0.6) return "safe";
  if (ratio >= 0.25) return "warn";
  return "crit";
}

interface AlertScreenProps {
  remaining: number;
  /** 자립시간 총량(초) */
  total?: number;
  countdown: number;
  /** 상단 띠 문구 (정전 상태 Context 값) */
  bandLabel?: string;
  onAnswer?: (answer: Exclude<AlertAnswer, null>) => void;
}

export function AlertScreen({
  remaining,
  total = autonomy.outageSeconds,
  countdown,
  bandLabel,
  onAnswer,
}: AlertScreenProps) {
  const guardianName =
    contacts.find((c) => c.priority === 1)?.name ?? contacts[0]?.name ?? "보호자";

  const ratio = total > 0 ? remaining / total : 0;
  const tone = toneForRatio(ratio);
  const filled = remaining > 0 ? Math.max(1, Math.ceil(ratio * 8)) : 0;

  return (
    <PhoneShell flash>
      <TopBand variant="crit" live label={bandLabel ?? "우리 동네에 전기가 나갔습니다"} />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-[1.25] text-ink">
          지금 댁에
          <br />
          전기가
          <br />
          끊겼습니다
        </h1>

        <TimeCard
          label="산소발생기를 쓸 수 있는 시간"
          value={formatDuration(remaining)}
          filled={filled}
          tone={tone}
        />

        <h2 className="t-subheading-sm font-bold text-ink">지금 어떠세요?</h2>

        <div className="flex flex-col gap-3">
          <BigButton
            variant="safe"
            title="괜찮습니다"
            description="기계가 잘 돌아가고 있어요"
            onClick={() => onAnswer?.("ok")}
          />
          <BigButton
            variant="warn"
            title="보호자 부르기"
            description={`${guardianName} 님께 지금 연락합니다`}
            onClick={() => onAnswer?.("guardian")}
          />
          <BigButton
            variant="crit"
            title="119에 전화하기"
            description="숨쉬기가 힘드시면 누르세요"
            onClick={() => onAnswer?.("call")}
          />
        </div>

        <div className="flex items-center gap-3 rounded-[14px] bg-crit-bg px-[18px] py-4">
          <span className="shrink-0 t-subheading-sm font-bold text-crit">
            {formatCountdown(countdown)}
          </span>
          <span className="t-copy-sm font-medium leading-[1.4] text-crit">
            안 누르셔도 됩니다. 그러면 보호자님께 저희가 연락합니다.
          </span>
        </div>
      </Pad>
    </PhoneShell>
  );
}

/** 에스컬레이션 제한 시간 */
export { escalationSeconds };
