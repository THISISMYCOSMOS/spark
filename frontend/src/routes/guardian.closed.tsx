import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useBack } from "@/hooks/useBack";

import { GuardianShell, GuardianSpacer } from "@/components/guardian/GuardianShell";
import { Band } from "@/components/guardian/Band";
import { InfoCard } from "@/components/guardian/InfoCard";
import { ActionResultDialog } from "@/components/guardian/ActionResultDialog";
import { GhostButton, PrimaryButton } from "@/components/guardian/Buttons";
import { OutageTag } from "@/components/guardian/OutageTag";
import { useGuardian } from "@/contexts/GuardianContext";
import { useOutageInfo } from "@/hooks/useOutageFlow";
import { useOutage } from "@/contexts/OutageContext";
import { getPatientId, isRealApiMode } from "@/lib/api/client";
import { getPatient } from "@/lib/api/patients";
import { saveGuardianAction, saveRecoveryConfirmation } from "@/lib/api/responses";

export const Route = createFileRoute("/guardian/closed")({
  head: () => ({
    meta: [
      { title: "상황 종료 · 정전 안심 케어" },
      {
        name: "description",
        content: "정전 대응을 마치고 기록을 정리하는 보호자 화면입니다.",
      },
      { property: "og:title", content: "상황 종료 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "정전 대응을 마치고 기록을 정리하는 보호자 화면입니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardianClosed,
});

function GuardianClosed() {
  const navigate = useNavigate();
  const goBack = useBack("/guardian/home");
  const { autonomyText } = useGuardian();
  const { endAt } = useOutageInfo();
  const { currentImpactCase } = useOutage();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({
    open: false,
    success: true,
    title: "",
    description: "",
  });

  const saveAndClose = async () => {
    if (saving) return;
    setSaving(true);

    if (!isRealApiMode()) {
      setResult({
        open: true,
        success: true,
        title: "대응 기록을 저장했습니다",
        description: "보호자 조치와 전원 연결 결과가 기록에 반영됐습니다.",
      });
      setSaving(false);
      return;
    }

    try {
      if (!currentImpactCase) throw new Error("저장할 정전 대응 상황을 찾을 수 없습니다.");
      const patientId = getPatientId("GUARDIAN") ?? currentImpactCase.impactCase.patientId;
      const detail = await getPatient(patientId);
      const contact =
        detail.emergencyContacts.find((item) => item.isActive && item.guardianId) ??
        detail.emergencyContacts.find((item) => item.isActive);
      if (!contact) throw new Error("저장할 보호자 연락처를 찾을 수 없습니다.");

      await saveGuardianAction(currentImpactCase.impactCase.id, {
        emergency_contact_id: contact.id,
        status: "COMPLETED",
        escalation_round: 1,
        note: "도착 후 전원 연결 완료",
        acted_at: new Date().toISOString(),
      });

      let recoverySaved = false;
      if (currentImpactCase.impactCase.status === "RECOVERY_CHECK") {
        await saveRecoveryConfirmation(currentImpactCase.impactCase.id, {
          home_power_restored: true,
          device_operating_normally: true,
          reason: "보호자 도착 후 전원 연결 및 의료기기 정상 작동 확인",
        });
        recoverySaved = true;
      }

      setResult({
        open: true,
        success: true,
        title: "대응 기록을 저장했습니다",
        description: recoverySaved
          ? "보호자 조치와 전원·기기 복구 확인이 모두 저장됐습니다."
          : "보호자 조치와 전원 연결 완료 상태가 저장됐습니다.",
      });
    } catch (cause) {
      setResult({
        open: true,
        success: false,
        title: "기록을 저장하지 못했습니다",
        description: cause instanceof Error ? cause.message : "잠시 후 다시 눌러주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GuardianShell
      title="상황 종료"
      time="21:50"
      network="정전 지역 · LTE"
      tag={<OutageTag />}
      onBack={goBack}
    >
      <Band variant="safe">{`상황 종료 · ${endAt}`}</Band>

      <h1 className="mt-4 whitespace-pre-line t-subheading font-bold leading-[1.35] text-ink">
        {"어머니는\n안전합니다"}
      </h1>
      <p className="mt-2 t-note leading-[1.5] text-dim">
        이번 기록은 다음 정전 때 버틸 수 있는 시간 계산에 반영됩니다.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <InfoCard title="총 대응 시간">
          알림부터 전원 연결까지 23분 · 버틸 수 있는 시간 41분 안에 해결
        </InfoCard>

        <InfoCard tone="warn" title="확인된 약점">
          예비 배터리가 90분에 그쳤습니다. 등록할 때 계산한 {autonomyText}보다 짧습니다.
        </InfoCard>

        <InfoCard title="참여">보호자 2명 · 구로1동 담당자 1명 · 119 미출동</InfoCard>
      </div>

      <GuardianSpacer />

      <PrimaryButton tone="dark" disabled={saving} onClick={() => void saveAndClose()}>
        {saving ? "기록을 저장하고 있습니다" : "기록 저장하고 닫기"}
      </PrimaryButton>
      <GhostButton className="mt-2.5">배터리 점검 예약하기</GhostButton>

      <ActionResultDialog
        open={result.open}
        onOpenChange={(open) => setResult((prev) => ({ ...prev, open }))}
        success={result.success}
        title={result.title}
        description={result.description}
        onConfirm={() => {
          if (result.success) void navigate({ to: "/guardian/home" });
        }}
      />
    </GuardianShell>
  );
}
