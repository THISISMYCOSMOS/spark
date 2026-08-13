import { createFileRoute } from "@tanstack/react-router";
import { VitalsPage } from "@/components/VitalsPage";
import { vitals } from "@/data/mock";

const spo2 = vitals.find((v) => v.id === "spo2")!;
const pulse = vitals.find((v) => v.id === "pulse")!;

export const Route = createFileRoute("/vitals/crit")({
  head: () => ({
    meta: [
      { title: "생체신호 위험 · 정전 안심 케어" },
      { name: "description", content: "생체신호가 위험 수준임을 알리는 화면입니다." },
      { property: "og:title", content: "생체신호 위험 · 정전 안심 케어" },
      { property: "og:description", content: "생체신호가 위험 수준임을 알리는 화면입니다." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <VitalsPage
      monitor={{ bpm: pulse.current.crit, spo2: spo2.current.crit }}
      tone="crit"
      topBandLabel="보호자님과 119에 알렸습니다"
      title={
        <>
          숨 쉬는 게
          <br />
          많이
          <br />
          낮습니다
        </>
      }
      breath={{
        label: "숨 쉬는 상태",
        value: `${spo2.current.crit}%`,
        usual: `평소에는 ${spo2.usual}% 쯤이에요`,
        verdict: "많이 낮습니다",
        tone: "crit",
      }}
      pulse={{
        label: "심장 뛰는 빠르기",
        value: pulse.current.crit,
        usual: `평소에는 ${pulse.usual}쯤이에요`,
        verdict: "평소보다 빠릅니다",
        tone: "crit",
      }}
      guide={
        <>
          이미 연락했습니다.
          <br />
          그대로 누워 계세요.
          <br />곧 사람이 도착합니다.
        </>
      }
    />
  );
}
