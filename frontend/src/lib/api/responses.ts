import { apiRequest } from "@/lib/api/client";
import type { GuardianActionView, RecoveryConfirmationView } from "@/lib/api/types";

export function saveGuardianAction(
  impactCaseId: string,
  body: {
    emergency_contact_id: string;
    status: "CONTACTED" | "ACTING" | "UNAVAILABLE" | "COMPLETED";
    escalation_round: number;
    note: string | null;
    acted_at: string;
  },
) {
  return apiRequest<GuardianActionView>(
    `/api/v1/impact-cases/${encodeURIComponent(impactCaseId)}/guardian-actions`,
    {
      method: "POST",
      role: "GUARDIAN",
      idempotencyKey: `guardian-action:${impactCaseId}:${body.emergency_contact_id}:${body.escalation_round}:${body.status}`,
      body,
    },
  );
}

export function saveRecoveryConfirmation(
  impactCaseId: string,
  body: {
    home_power_restored: boolean;
    device_operating_normally: boolean;
    reason: string;
  },
) {
  return apiRequest<RecoveryConfirmationView>(
    `/api/v1/impact-cases/${encodeURIComponent(impactCaseId)}/recovery-confirmations`,
    {
      method: "POST",
      role: "GUARDIAN",
      idempotencyKey: `recovery-confirmation:${impactCaseId}:${body.home_power_restored}:${body.device_operating_normally}`,
      body,
    },
  );
}
