import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { PrimaryButton } from "@/components/guardian/Buttons";

export const Route = createFileRoute("/guardian/join/done")({
  head: () => ({
    meta: [
      { title: "등록 완료 — 정전 돌봄 등록 5단계" },
      {
        name: "description",
        content: "정전 돌봄 서비스 등록이 완료되었습니다.",
      },
      { property: "og:title", content: "등록 완료 — 정전 돌봄 등록 5단계" },
      {
        property: "og:description",
        content: "정전 돌봄 서비스 등록이 완료되었습니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianJoinDone,
});

function GuardianJoinDone() {
  const navigate = useNavigate();

  return (
    <GuardianShell
      title="보호자 등록"
      tag={<span className="whitespace-nowrap t-caption-sm font-semibold text-mute">5 / 5</span>}
      time="21:00"
      network="LTE"
      progress={5}
    >
      <h1 className="t-title-lg font-bold leading-[1.35] text-ink">
        등록이
        <br />
        완료되었습니다
      </h1>
      <p className="t-note-sm leading-[1.5] text-dim">이 화면은 아직 준비 중입니다.</p>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/home" })}>홈으로 가기</PrimaryButton>
    </GuardianShell>
  );
}
