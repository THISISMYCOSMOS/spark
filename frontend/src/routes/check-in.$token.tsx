import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { BigButton } from "@/components/BigButton";
import { Pad } from "@/components/Pad";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { ApiError } from "@/lib/api/client";
import { submitPublicCheckInResponse } from "@/lib/api/outages";

type CheckInPurpose = "OUTAGE_STATUS" | "RECOVERY_CONFIRMATION";

export const Route = createFileRoute("/check-in/$token")({
  validateSearch: (search: Record<string, unknown>): { purpose: CheckInPurpose } => ({
    purpose:
      search["purpose"] === "RECOVERY_CONFIRMATION" ? "RECOVERY_CONFIRMATION" : "OUTAGE_STATUS",
  }),
  head: () => ({
    meta: [
      { title: "상태 확인 · 정전 안심 케어" },
      { name: "description", content: "문자로 받은 링크에서 현재 상태를 알려주세요." },
    ],
  }),
  component: PublicCheckInPage,
});

function PublicCheckInPage() {
  const { token } = Route.useParams();
  const { purpose } = Route.useSearch();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submit = async (
    body:
      | { response_type: "NORMAL" | "NEED_HELP" | "EQUIPMENT_ISSUE"; note: string | null }
      | {
          home_power_restored: boolean;
          device_operating_normally: boolean;
          note: string | null;
        },
  ) => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setError("");
    try {
      await submitPublicCheckInResponse(token, body);
      setSubmitted(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "상태를 보내지 못했습니다. 다시 눌러주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <PhoneShell>
        <TopBand variant="safe" label="상태를 전달했습니다" />
        <Pad>
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <CheckCircle2 className="h-20 w-20 text-safe" aria-hidden="true" />
            <h1 className="t-heading-lg font-bold leading-tight text-ink">응답이 저장됐습니다</h1>
            <p className="t-body leading-relaxed text-dim">
              보호자와 담당자가 확인할 수 있습니다.
              <br />이 화면은 닫으셔도 됩니다.
            </p>
          </div>
        </Pad>
      </PhoneShell>
    );
  }

  const recovery = purpose === "RECOVERY_CONFIRMATION";

  return (
    <PhoneShell>
      <TopBand
        variant={recovery ? "safe" : "crit"}
        label={recovery ? "전기와 기계 상태를 확인합니다" : "현재 상태를 알려주세요"}
      />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-tight text-ink">
          {recovery ? (
            <>
              전기가 돌아왔고
              <br />
              기계도 잘 작동하나요?
            </>
          ) : (
            <>
              지금
              <br />
              어떠세요?
            </>
          )}
        </h1>
        <p className="t-body leading-relaxed text-dim">
          아래에서 지금 상태와 가장 가까운 버튼을 눌러주세요.
        </p>

        <div className="mt-auto flex flex-col gap-3">
          {recovery ? (
            <>
              <BigButton
                variant="safe"
                title="전기와 기계 모두 정상입니다"
                description="복구된 상태로 전달합니다"
                disabled={submitting}
                onClick={() =>
                  void submit({
                    home_power_restored: true,
                    device_operating_normally: true,
                    note: "전기와 의료기기 작동 정상",
                  })
                }
              />
              <BigButton
                variant="warn"
                title="전기는 왔지만 기계가 이상합니다"
                description="기기 확인이 필요한 상태입니다"
                disabled={submitting}
                onClick={() =>
                  void submit({
                    home_power_restored: true,
                    device_operating_normally: false,
                    note: "전력 복구 후 의료기기 이상",
                  })
                }
              />
              <BigButton
                variant="crit"
                title="아직 전기가 안 왔습니다"
                description="복구되지 않은 상태로 전달합니다"
                disabled={submitting}
                onClick={() =>
                  void submit({
                    home_power_restored: false,
                    device_operating_normally: false,
                    note: "가정 전력 미복구",
                  })
                }
              />
            </>
          ) : (
            <>
              <BigButton
                variant="safe"
                title="괜찮습니다"
                description="기계가 잘 돌아가고 있어요"
                disabled={submitting}
                onClick={() => void submit({ response_type: "NORMAL", note: null })}
              />
              <BigButton
                variant="warn"
                title="보호자가 필요합니다"
                description="도움이 필요한 상태입니다"
                disabled={submitting}
                onClick={() =>
                  void submit({ response_type: "NEED_HELP", note: "보호자 도움이 필요합니다." })
                }
              />
              <BigButton
                variant="crit"
                title="기계에 문제가 있습니다"
                description="전원이나 의료기기를 확인해 주세요"
                disabled={submitting}
                onClick={() =>
                  void submit({
                    response_type: "EQUIPMENT_ISSUE",
                    note: "의료기기 확인이 필요합니다.",
                  })
                }
              />
            </>
          )}
        </div>

        {submitting ? (
          <p role="status" className="text-center t-body font-semibold text-safe">
            전송 중입니다.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-center t-body font-semibold text-crit">
            {error}
          </p>
        ) : null}
      </Pad>
    </PhoneShell>
  );
}
