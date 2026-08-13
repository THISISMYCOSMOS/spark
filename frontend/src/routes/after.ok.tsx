import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { InfoCard } from "@/components/InfoCard";
import { LineButton } from "@/components/LineButton";

export const Route = createFileRoute("/after/ok")({
  head: () => ({
    meta: [
      { title: "잘 알겠습니다 · 정전 안심 케어" },
      { name: "description", content: "괜찮다고 알려주신 뒤 계속 지켜보는 화면입니다." },
      { property: "og:title", content: "잘 알겠습니다 · 정전 안심 케어" },
      { property: "og:description", content: "괜찮다고 알려주신 뒤 계속 지켜보는 화면입니다." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();

  return (
    <PhoneShell>
      <TopBand variant="safe" label="괜찮다고 알려주셨습니다" />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-tight text-ink">잘 알겠습니다</h1>

        <InfoCard title="20분 뒤에 다시 여쭤봅니다">
          배터리가 30분 아래로 내려가면
          <br />
          보호자님께 저희가 연락합니다
        </InfoCard>

        <p className="t-title-sm font-semibold leading-[150%] text-ink">
          편히 계세요.
          <br />
          계속 지켜보고 있습니다.
        </p>

        <div className="mt-auto">
          <LineButton onClick={() => navigate({ to: "/after/done" })}>
            전기가 다시 들어왔어요
          </LineButton>
        </div>
      </Pad>
    </PhoneShell>
  );
}
