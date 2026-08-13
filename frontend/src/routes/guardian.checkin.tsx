import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { InfoCard } from "@/components/guardian/InfoCard";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { ToggleSwitch } from "@/components/guardian/ToggleSwitch";
import { useGuardianOutageFlow } from "@/hooks/useOutageFlow";

export const Route = createFileRoute("/guardian/checkin")({
  head: () => ({
    meta: [
      { title: "안부 묻기 · 정전 안심 케어" },
      {
        name: "description",
        content: "보호자가 대상자에게 안부를 묻는 화면입니다.",
      },
      { property: "og:title", content: "안부 묻기 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "보호자가 대상자에게 안부를 묻는 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianCheckin,
});

function GuardianCheckin() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/home");
  const [autoAsk, setAutoAsk] = useState(true);
  const [notifyNoReply, setNotifyNoReply] = useState(true);

  // 정전 발생 시 보호자 경보 화면으로 자동 이동합니다.
  useGuardianOutageFlow();

  return (
    <GuardianShell
      title="안부 묻기"
      time="21:00"
      network="LTE"
      tag={
        <span className="shrink-0 whitespace-nowrap rounded-full bg-safe-bg px-2.5 py-1 t-micro font-semibold text-safe">
          평상시
        </span>
      }
      onBack={goBack}
    >
      <Band variant="safe">어머니 앱 연결됨 · 마지막 확인 3일 전</Band>

      <h1 className="whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"어머니께\n안부를 물어볼까요?"}
      </h1>
      <p className="t-note leading-[1.5] text-dim">
        어머니 화면에 큰 글씨로 뜹니다. 버튼 하나만 누르시면 됩니다.
      </p>

      <InfoCard title="보낼 내용">
        “수현이가 잘 지내시는지 물어봅니다. 괜찮으시면 아래를 눌러주세요.”
      </InfoCard>

      <div className="flex flex-col gap-3">
        <SettingRow
          title="매일 저녁 자동으로 묻기"
          desc="저녁 8시에 어머니께 안부를 여쭙니다"
          checked={autoAsk}
          onCheckedChange={setAutoAsk}
        />
        <SettingRow
          title="답이 없으면 알려주기"
          desc="2시간 안에 답이 없으면 알림을 보냅니다"
          checked={notifyNoReply}
          onCheckedChange={setNotifyNoReply}
        />
      </div>

      <GuardianSpacer />

      <PrimaryButton onClick={() => navigate({ to: "/guardian/reply" })}>
        지금 안부 묻기
      </PrimaryButton>
      <GhostButton onClick={() => navigate({ to: "/guardian/home" })}>돌아가기</GhostButton>
    </GuardianShell>
  );
}

type SettingRowProps = {
  title: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function SettingRow({ title, desc, checked, onCheckedChange }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border-[1.5px] border-line bg-paper px-4 py-3.5">
      <div className="min-w-0">
        <p className="t-copy-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 t-caption-sm leading-[1.45] text-dim">{desc}</p>
      </div>
      <ToggleSwitch checked={checked} onCheckedChange={onCheckedChange} label={title} />
    </div>
  );
}
