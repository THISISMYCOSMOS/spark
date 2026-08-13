import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { useGuardian } from "@/contexts/GuardianContext";
import { buildGuardianSummary } from "@/lib/guardianSummary";
import { ApiError, isRealApiMode } from "@/lib/api/client";
import { registerGuardianProfile } from "@/lib/registration";

export const Route = createFileRoute("/guardian/join/confirm")({
  head: () => ({
    meta: [
      { title: "정보 확인 — 정전 돌봄 등록 5단계" },
      {
        name: "description",
        content: "정전 돌봄 서비스 등록 정보를 확인하는 단계입니다.",
      },
      { property: "og:title", content: "정보 확인 — 정전 돌봄 등록 5단계" },
      {
        property: "og:description",
        content: "등록한 정보를 확인하고 완료합니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianJoinConfirm,
});

function GuardianJoinConfirm() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/join/contacts");
  const guardian = useGuardian();
  const rows = buildGuardianSummary(guardian);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const register = async () => {
    if (!isRealApiMode()) {
      navigate({ to: "/guardian/join/code" });
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const result = await registerGuardianProfile(guardian);
      guardian.setPatientCode(result.guardianCode ?? "");
      navigate({ to: "/guardian/join/code" });
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GuardianShell
      title="보호자 등록"
      tag={<span className="whitespace-nowrap t-caption-sm font-semibold text-mute">5 / 5</span>}
      time="21:00"
      network="LTE"
      progress={5}
      onBack={goBack}
    >
      <h1 className="t-title-lg font-bold leading-[1.35] text-ink">
        이대로
        <br />
        등록할까요?
      </h1>
      <p className="t-note-sm leading-[1.5] text-dim">나중에 언제든 고칠 수 있습니다.</p>

      <dl className="rounded-[14px] border-[1.5px] border-line bg-paper">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-start gap-3 px-4 py-[13px] ${
              index < rows.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <dt className="w-[72px] shrink-0 t-caption font-medium leading-[1.5] text-dim">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 whitespace-pre-line text-right t-input font-semibold leading-[1.5] text-ink">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <GuardianSpacer />

      {error ? (
        <p role="alert" className="mb-3 rounded-[12px] bg-crit-bg px-4 py-3 t-note-sm text-crit">
          {error}
        </p>
      ) : null}

      <PrimaryButton disabled={isSubmitting} onClick={() => void register()}>
        {isSubmitting ? "등록하는 중입니다" : "등록하기"}
      </PrimaryButton>
      <GhostButton onClick={() => navigate({ to: "/guardian/join/profile" })}>
        처음부터 고치기
      </GhostButton>
    </GuardianShell>
  );
}
