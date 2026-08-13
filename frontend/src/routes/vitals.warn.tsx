import { createFileRoute } from "@tanstack/react-router";
import { VitalsPage } from "@/components/VitalsPage";
import { vitals } from "@/data/mock";

const spo2 = vitals.find((v) => v.id === "spo2")!;
const pulse = vitals.find((v) => v.id === "pulse")!;

export const Route = createFileRoute("/vitals/warn")({
  head: () => ({
    meta: [
      { title: "생체신호 주의 · 정전 안심 케어" },
      { name: "description", content: "생체신호 중 하나가 평소와 다름을 알리는 화면입니다." },
      { property: "og:title", content: "생체신호 주의 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "생체신호 중 하나가 평소와 다름을 알리는 화면입니다.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <VitalsPage
      monitor={{ bpm: pulse.current.warn, spo2: spo2.current.warn }}
      tone="warn"
      topBandLabel="하나가 평소와 다릅니다"
      title={
        <>
          숨 쉬는 게
          <br />
          평소보다
          <br />
          낮습니다
        </>
      }
      breath={{
        label: "숨 쉬는 상태",
        value: `${spo2.current.warn}%`,
        usual: `평소에는 ${spo2.usual}% 쯤이에요`,
        verdict: "평소보다 낮습니다",
        tone: "warn",
      }}
      pulse={{
        label: "심장 뛰는 빠르기",
        value: pulse.current.warn,
        usual: `평소에는 ${pulse.usual}쯤이에요`,
        verdict: "평소와 비슷합니다",
        tone: "safe",
      }}
      guide={<>조금만 더 지켜보겠습니다.</>}
    />
  );
}
