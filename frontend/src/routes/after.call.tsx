import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { BigButton } from "@/components/BigButton";
import { LineButton } from "@/components/LineButton";
import { contacts, emergencyNumber, messages, patient } from "@/data/mock";

export const Route = createFileRoute("/after/call")({
  head: () => ({
    meta: [
      { title: "119 신고 안내 · 정전 안심 케어" },
      { name: "description", content: "119에 전달할 위치와 상황을 정리해 보여주는 화면입니다." },
      { property: "og:title", content: "119 신고 안내 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "119에 전달할 위치와 상황을 정리해 보여주는 화면입니다.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const guardian = contacts[0];

  const rows = [
    { label: "어디", value: patient.address },
    { label: "무슨 일", value: messages.emergencySituation },
    {
      label: "누구",
      value: `${patient.name} ${patient.age}세 ${patient.condition}`,
    },
  ];

  return (
    <PhoneShell>
      <TopBand variant="crit" label="119에 이렇게 말씀하세요" />
      <Pad>
        <div className="rounded-[14px] border-2 border-safe-line bg-safe-bg px-4 py-3">
          <p className="t-copy font-semibold text-safe">
            {guardian?.relation ?? "따님"} {guardian?.name ?? "보호자"} 님께는 이미 알렸습니다.
          </p>
        </div>

        <div className="rounded-[20px] border-2 border-line bg-wash p-[22px]">
          {rows.map((row, i) => (
            <div key={row.label} className={i > 0 ? "mt-4 border-t border-line pt-4" : ""}>
              <div className="t-copy-sm font-medium text-dim">{row.label}</div>
              <div className="mt-1 t-title-lg font-bold leading-[140%] text-ink">{row.value}</div>
            </div>
          ))}
        </div>

        <p className="t-body-sm font-normal text-dim">
          읽기 힘드시면 화면을 그대로 보여주셔도 됩니다.
        </p>

        <div className="mt-auto flex flex-col gap-3">
          <BigButton
            as="a"
            href={`tel:${emergencyNumber}`}
            variant="crit"
            center
            title={`${emergencyNumber}에 전화 걸기`}
            onClick={() => navigate({ to: "/after/dial" })}
          />
          <LineButton onClick={() => navigate({ to: "/alert" })}>돌아가기</LineButton>
        </div>
      </Pad>
    </PhoneShell>
  );
}
