import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { InfoCard } from "@/components/InfoCard";
import { LineButton } from "@/components/LineButton";
import { useApp } from "@/contexts/AppContext";
import { outage } from "@/data/mock";

export const Route = createFileRoute("/after/done")({
  head: () => ({
    meta: [
      { title: "수고하셨습니다 · 정전 안심 케어" },
      { name: "description", content: "정전 상황이 종료되었음을 알리는 완료 화면입니다." },
      { property: "og:title", content: "수고하셨습니다 · 정전 안심 케어" },
      { property: "og:description", content: "정전 상황이 종료되었음을 알리는 완료 화면입니다." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const { reset } = useApp();

  const handleRestart = () => {
    reset();
    navigate({ to: "/home" });
  };

  return (
    <PhoneShell>
      <TopBand variant="safe" label="이번 정전이 끝났습니다" />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-tight text-ink">수고하셨습니다</h1>

        <InfoCard title={`${outage.durationMinutes}분 동안 정전`}>
          배터리로 끝까지 버텼습니다
          <br />
          보호자님께서 확인하고 가셨습니다
        </InfoCard>

        <p className="t-title-sm font-semibold leading-[150%] text-ink">
          오늘 밤 배터리를
          <br />꼭 충전해 두세요.
        </p>

        <div className="mt-auto">
          <LineButton onClick={handleRestart}>처음으로</LineButton>
        </div>
      </Pad>
    </PhoneShell>
  );
}
