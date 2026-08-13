import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { BigButton } from "@/components/BigButton";
import { LineButton } from "@/components/LineButton";
import { useGuardian, DEVICE_OPTIONS } from "@/contexts/GuardianContext";

export const Route = createFileRoute("/join/confirm")({
  head: () => ({
    meta: [
      { title: "정보 확인 · 정전 안심 케어" },
      { name: "description", content: "정보 확인 화면 - 정전 취약가구 안심 케어 앱 프로토타입." },
      { property: "og:title", content: "정보 확인 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "정보 확인 화면 - 정전 취약가구 안심 케어 앱 프로토타입.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const g = useGuardian();
  const rows = [
    { label: "이름", value: `${g.patientName} (${g.patientAge}세)` },
    { label: "사는 곳", value: `${g.addressLine1} ${g.addressLine2}` },
    {
      label: "쓰시는 기계",
      value:
        g.selectedMachines
          .map((id) => DEVICE_OPTIONS.find((d) => d.id === id)?.name ?? id)
          .join(", ") || "-",
    },
    {
      label: "도와줄 사람",
      value:
        [g.guardianName, ...g.otherGuardians.map((c) => c.name)].filter(Boolean).join(", ") || "-",
    },
  ];

  return (
    <PhoneShell>
      <TopBand variant="safe" label={`${g.guardianName || "보호자"} 님이 등록해 두셨습니다`} />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-tight text-ink">
          이 내용이
          <br />
          맞습니까?
        </h1>

        <div className="rounded-[20px] bg-wash p-[22px]">
          <dl className="flex flex-col">
            {rows.map((row, index) => (
              <div
                key={row.label}
                className={`flex flex-col gap-1 py-4 first:pt-0 last:pb-0 ${
                  index < rows.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <dt className="t-copy-sm font-medium text-dim">{row.label}</dt>
                <dd className="whitespace-pre-line t-title font-bold text-ink leading-snug">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <Link to="/join/done">
            <BigButton title="네, 맞습니다" variant="safe" center />
          </Link>
          <LineButton>틀린 곳이 있어요</LineButton>
        </div>
      </Pad>
    </PhoneShell>
  );
}
