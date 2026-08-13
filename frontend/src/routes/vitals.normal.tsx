import { createFileRoute } from "@tanstack/react-router";
import { VitalsPage } from "@/components/VitalsPage";
import { vitals } from "@/data/mock";

const spo2 = vitals.find((v) => v.id === "spo2")!;
const pulse = vitals.find((v) => v.id === "pulse")!;

export const Route = createFileRoute("/vitals/normal")({
  head: () => ({
    meta: [
      { title: "생체신호 정상 · 정전 안심 케어" },
      { name: "description", content: "생체신호가 평소와 같음을 알리는 화면입니다." },
      { property: "og:title", content: "생체신호 정상 · 정전 안심 케어" },
      { property: "og:description", content: "생체신호가 평소와 같음을 알리는 화면입니다." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <VitalsPage
      monitor={{ bpm: pulse.current.safe, spo2: spo2.current.safe }}
      tone="safe"
      topBandLabel="평소와 같습니다"
      title={
        <>
          오늘도
          <br />
          괜찮으십니다
        </>
      }
      breath={{
        label: "숨 쉬는 상태",
        value: `${spo2.current.safe}%`,
        usual: `평소에는 ${spo2.usual}% 쯤이에요`,
        verdict: "평소와 같습니다",
        tone: "safe",
      }}
      pulse={{
        label: "심장 뛰는 빠르기",
        value: pulse.current.safe,
        usual: `평소에는 ${pulse.usual}쯤이에요`,
        verdict: "평소와 같습니다",
        tone: "safe",
      }}
      guide={
        <>
          기계가 계속 보고 있습니다.
          <br />
          달라지면 바로 알려드립니다.
        </>
      }
    />
  );
}
