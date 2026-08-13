import { DeliveryStatus, ImpactCaseStatus, OutageStatus, PatientResponse } from "../contracts.js";
import { JobType } from "../jobs/queue.js";
import { buildNotificationDeduplicationKey } from "../notifications/service.js";
import { NotificationType, renderTemplate } from "../notifications/templates.js";
import { selectEscalationTarget } from "./escalation.js";
import { createImpactCases } from "./matching.js";
import { DEMO_ONLY_RISK_POLICY, evaluateRisk } from "./risk.js";
import { calculateSafetyTime } from "./safety-time.js";
import { createStatusCheck, isStatusCheckDue, respondToStatusCheck, timeoutStatusCheck } from "./status-check.js";

const STATUS_CHECK_PURPOSE = Object.freeze({
  OUTAGE_STATUS: "OUTAGE_STATUS",
  RECOVERY_CONFIRMATION: "RECOVERY_CONFIRMATION",
});

function deliveryAccepted(result) {
  return result?.delivery?.status === DeliveryStatus.ACCEPTED;
}

function deliveryFailure(result, fallbackErrorCode = "NOTIFICATION_FAILED") {
  const delivery = result?.delivery ?? null;
  return {
    ok: false,
    delivery,
    errorCode: delivery?.errorCode ?? fallbackErrorCode,
    retryable: Boolean(delivery?.retryable),
  };
}

/** Orchestrates decisions only. Backend 1 persists returned snapshots and
 * commands; Backend 2 never writes a production database. */
export class OutageWorkflow {
  constructor({
    notificationService,
    responseLinkIssuer,
    jobQueue,
    riskPolicy = DEMO_ONLY_RISK_POLICY,
    templateRenderer = renderTemplate,
    messageComposer = null,
    responsePlanComposer = null,
  }) {
    this.notificationService = notificationService;
    this.responseLinkIssuer = responseLinkIssuer;
    this.jobQueue = jobQueue;
    this.riskPolicy = riskPolicy;
    this.templateRenderer = templateRenderer;
    this.messageComposer = messageComposer;
    this.responsePlanComposer = responsePlanComposer;
  }

  async start({ outage, patients, existingCases = [], now = new Date() }) {
    const result = this.prepare({ outage, patients, existingCases, now });
    const execution = await this.executePrepared({ outage, patients, impactCases: result.created, now });
    return { ...result, ...execution };
  }

  prepare({ outage, patients, existingCases = [], now = new Date() }) {
    return createImpactCases({ outage, patients, existingCases, now, riskPolicy: this.riskPolicy });
  }

  async executePrepared({ outage, patients, impactCases, now = new Date() }) {
    if (!Array.isArray(impactCases)) throw new TypeError("impactCases must be an array");
    const statusChecks = [];
    const notificationFailures = [];
    const responsePlans = [];

    for (const impactCase of impactCases) {
      const patient = patients.find((item) => item.id === impactCase.patientId);
      if (outage.status === OutageStatus.ACTIVE && this.responsePlanComposer) {
        const responsePlan = await this.responsePlanComposer.compose({ patient, outage, impactCase });
        impactCase.responsePlanActionCodes = responsePlan.actions.map((action) => action.code);
        responsePlans.push({ impactCaseId: impactCase.id, ...responsePlan });
      }
      if (outage.status === OutageStatus.SCHEDULED) {
        const sent = await this.#send({
          outage,
          impactCase,
          patient,
          recipientType: "PATIENT",
          recipientId: patient.id,
          to: patient.phone,
          templateType: NotificationType.PLANNED_OUTAGE_PREPARE,
          variables: { patientName: patient.name, startsAt: outage.scheduledStartAt },
          escalationRound: 0,
          now,
        });
        if (!deliveryAccepted(sent)) notificationFailures.push({ impactCaseId: impactCase.id, ...deliveryFailure(sent) });
        continue;
      }

      // An active case is not WAITING_PATIENT until the provider accepts the
      // status-check message and its response token is activated.
      impactCase.status = ImpactCaseStatus.PREPARE;
      const begun = await this.#beginStatusCheck({
        outage,
        impactCase,
        patient,
        purpose: STATUS_CHECK_PURPOSE.OUTAGE_STATUS,
        now,
      });
      if (begun.ok) statusChecks.push(begun.statusCheck);
      else notificationFailures.push({ impactCaseId: impactCase.id, ...begun });
    }
    return { statusChecks, notificationFailures, responsePlans };
  }

  async applyPatientResponse({ impactCase, statusCheck, patient, outage, response, now = new Date() }) {
    if (!Object.values(PatientResponse).includes(response)) {
      throw new TypeError("Invalid PatientResponse");
    }
    const respondedCheck = respondToStatusCheck(statusCheck, response, now);
    const safetyTime = this.#recomputeSafetyTime(patient, outage, now);
    const risk = evaluateRisk({ safetyTime, response, policy: this.riskPolicy });

    impactCase.safetyTime = safetyTime;
    impactCase.response = response;
    impactCase.riskLevel = risk.level;
    impactCase.riskReason = risk.reason;
    impactCase.policyId = risk.policyId;
    impactCase.policyVersion = risk.policyVersion;
    impactCase.updatedAt = new Date(now).toISOString();

    if (risk.level === "WATCH") {
      impactCase.status = ImpactCaseStatus.MONITORING;
      return { impactCase, statusCheck: respondedCheck };
    }
    impactCase.status = ImpactCaseStatus.ACTION_REQUIRED;
    const escalation = await this.#escalateGuardian({ outage, impactCase, patient, now });
    return { impactCase, statusCheck: respondedCheck, escalation };
  }

  async handleStatusCheckTimeout({ impactCase, statusCheck, patient, outage, now = new Date() }) {
    if (!isStatusCheckDue(statusCheck, now)) {
      return { impactCase, statusCheck, skipped: true, reason: "STATUS_CHECK_NOT_DUE" };
    }
    const timedOutCheck = timeoutStatusCheck(statusCheck, now);
    const safetyTime = this.#recomputeSafetyTime(patient, outage, now);
    const risk = evaluateRisk({ safetyTime, statusCheckTimedOut: true, policy: this.riskPolicy });

    impactCase.safetyTime = safetyTime;
    impactCase.riskLevel = risk.level;
    impactCase.riskReason = risk.reason;
    impactCase.policyId = risk.policyId;
    impactCase.policyVersion = risk.policyVersion;
    impactCase.status = ImpactCaseStatus.ACTION_REQUIRED;
    impactCase.updatedAt = new Date(now).toISOString();

    const escalation = await this.#escalateGuardian({ outage, impactCase, patient, now });
    return { impactCase, statusCheck: timedOutCheck, escalation };
  }

  async escalateToNextGuardian({ outage, impactCase, patient, now = new Date() }) {
    return this.#escalateGuardian({ outage, impactCase, patient, now });
  }

  async reportRecovery({ outage, impactCases, patients, now = new Date() }) {
    const statusChecks = [];
    const notificationFailures = [];
    for (const impactCase of impactCases) {
      const patient = patients.find((item) => item.id === impactCase.patientId);
      impactCase.recoveryEscalationRound = 0;
      const begun = await this.#beginStatusCheck({
        outage,
        impactCase,
        patient,
        purpose: STATUS_CHECK_PURPOSE.RECOVERY_CONFIRMATION,
        now,
      });
      if (begun.ok) statusChecks.push(begun.statusCheck);
      else notificationFailures.push({ impactCaseId: impactCase.id, ...begun });
    }
    return { impactCases, statusChecks, notificationFailures };
  }

  async handleRecoveryTimeoutOrUnconfirmed({ impactCase, patient, now = new Date() }) {
    const target = selectEscalationTarget({
      contacts: patient.emergencyContacts ?? [],
      escalationRound: impactCase.recoveryEscalationRound,
    });

    if (target.exhausted) {
      const institutionPhone = this.#institutionPhone(patient);
      if (!institutionPhone) {
        return { impactCase, notified: "NONE", error: "NO_RECIPIENT_AVAILABLE" };
      }
      const sent = await this.#send({
        outage: { id: impactCase.outageId, mode: impactCase.mode },
        impactCase,
        patient,
        recipientType: "INSTITUTION",
        recipientId: "INSTITUTION",
        to: institutionPhone,
        templateType: NotificationType.RECOVERY_CONFIRMATION,
        variables: { patientName: patient.name, responseUrl: "" },
        escalationRound: target.nextEscalationRound,
        now,
      });
      if (!deliveryAccepted(sent)) return { impactCase, notified: "NONE", ...deliveryFailure(sent) };
      return { impactCase, notified: "INSTITUTION", delivery: sent.delivery };
    }

    const issued = await this.responseLinkIssuer.issueLink({
      impactCaseId: impactCase.id,
      purpose: STATUS_CHECK_PURPOSE.RECOVERY_CONFIRMATION,
      now,
      expiresAt: new Date(new Date(now).getTime() + this.riskPolicy.responseTimeoutSeconds * 1000).toISOString(),
    });
    const sent = await this.#send({
      outage: { id: impactCase.outageId, mode: impactCase.mode },
      impactCase,
      patient,
      recipientType: "GUARDIAN",
      recipientId: target.contact.id ?? target.contact.phone,
      to: target.contact.phone,
      templateType: NotificationType.RECOVERY_CONFIRMATION,
      variables: { patientName: patient.name, responseUrl: issued.url },
      escalationRound: target.nextEscalationRound - 1,
      now,
    });
    if (!deliveryAccepted(sent)) return { impactCase, notified: "NONE", ...deliveryFailure(sent) };

    impactCase.recoveryEscalationRound = target.nextEscalationRound;
    impactCase.updatedAt = new Date(now).toISOString();
    return { impactCase, notified: "GUARDIAN", contact: target.contact, delivery: sent.delivery };
  }

  async #beginStatusCheck({ outage, impactCase, patient, purpose, now }) {
    const templateType =
      purpose === STATUS_CHECK_PURPOSE.OUTAGE_STATUS
        ? NotificationType.OUTAGE_STATUS_CHECK
        : NotificationType.RECOVERY_CONFIRMATION;
    const deduplicationKey = buildNotificationDeduplicationKey({
      impactCaseId: impactCase.id,
      templateType,
      recipientId: patient.id,
      to: patient.phone,
      escalationRound: 0,
    });
    const reserved = await this.#reserveLink({
      impactCaseId: impactCase.id,
      purpose,
      now,
      idempotencyKey: deduplicationKey,
    });
    if (!reserved?.ok) {
      return {
        ok: false,
        delivery: null,
        errorCode: reserved?.errorCode ?? "TOKEN_RESERVATION_FAILED",
        retryable: Boolean(reserved?.retryable),
      };
    }

    const sent = await this.#send({
      outage,
      impactCase,
      patient,
      recipientType: "PATIENT",
      recipientId: patient.id,
      to: patient.phone,
      templateType,
      variables: { patientName: patient.name, responseUrl: reserved.data.url },
      escalationRound: 0,
      responseTokenReservationId: reserved.data.reservationId,
      now,
    });
    if (!deliveryAccepted(sent)) return deliveryFailure(sent);

    const acceptedAt = sent.delivery.providerAcceptedAt;
    if (!acceptedAt) return deliveryFailure(sent, "PROVIDER_ACCEPTED_AT_MISSING");
    const timeoutAt = new Date(
      new Date(acceptedAt).getTime() + this.riskPolicy.responseTimeoutSeconds * 1000,
    ).toISOString();
    const activated = await this.#activateLink({
      reservationId: reserved.data.reservationId,
      activatedAt: acceptedAt,
      expiresAt: timeoutAt,
    });
    if (!activated?.ok) {
      return {
        ok: false,
        delivery: sent.delivery,
        errorCode: activated?.errorCode ?? "TOKEN_ACTIVATION_FAILED",
        retryable: Boolean(activated?.retryable),
      };
    }

    const statusCheck = createStatusCheck({
      impactCaseId: impactCase.id,
      purpose,
      now: acceptedAt,
      timeoutSeconds: this.riskPolicy.responseTimeoutSeconds,
      ...(activated.data?.statusCheckId ? { idFactory: () => activated.data.statusCheckId } : {}),
    });
    impactCase.status =
      purpose === STATUS_CHECK_PURPOSE.OUTAGE_STATUS ? ImpactCaseStatus.WAITING_PATIENT : ImpactCaseStatus.RECOVERY_CHECK;
    impactCase.updatedAt = acceptedAt;

    this.jobQueue.schedule({
      type: purpose === STATUS_CHECK_PURPOSE.OUTAGE_STATUS ? JobType.STATUS_CHECK_TIMEOUT : JobType.RECOVERY_TIMEOUT,
      runAt: statusCheck.timeoutAt,
      payload: { impactCaseId: impactCase.id, statusCheckId: statusCheck.id },
      idempotencyKey: `${purpose}:${statusCheck.id}`,
    });

    return { ok: true, statusCheck, delivery: sent.delivery };
  }

  async #reserveLink(input) {
    const method = this.responseLinkIssuer?.reserveLink ?? this.responseLinkIssuer?.reserveResponseToken;
    if (typeof method !== "function") return { ok: false, errorCode: "TOKEN_RESERVATION_PORT_MISSING", retryable: false };
    return method.call(this.responseLinkIssuer, input);
  }

  async #activateLink(input) {
    const method = this.responseLinkIssuer?.activateLink ?? this.responseLinkIssuer?.activateResponseToken;
    if (typeof method !== "function") return { ok: false, errorCode: "TOKEN_ACTIVATION_PORT_MISSING", retryable: false };
    return method.call(this.responseLinkIssuer, input);
  }

  async #escalateGuardian({ outage, impactCase, patient, now }) {
    const target = selectEscalationTarget({
      contacts: patient.emergencyContacts ?? [],
      escalationRound: impactCase.escalationRound,
    });

    if (target.exhausted) {
      const risk = evaluateRisk({ safetyTime: impactCase.safetyTime, allGuardiansUnavailable: true, policy: this.riskPolicy });
      impactCase.riskLevel = risk.level;
      impactCase.riskReason = risk.reason;
      impactCase.policyId = risk.policyId;
      impactCase.policyVersion = risk.policyVersion;
      impactCase.updatedAt = new Date(now).toISOString();
      const institutionResult = await this.#notifyInstitution({ outage, impactCase, patient, escalationRound: target.nextEscalationRound, now });
      if (!institutionResult.sent) {
        return {
          impactCase,
          notified: "NONE",
          error: institutionResult.error ?? "NO_RECIPIENT_AVAILABLE",
          errorCode: institutionResult.errorCode,
          retryable: institutionResult.retryable,
        };
      }
      return { impactCase, notified: "INSTITUTION", delivery: institutionResult.delivery };
    }

    const templateType =
      impactCase.riskLevel === "CRITICAL" ? NotificationType.CRITICAL_ALERT : NotificationType.GUARDIAN_ACTION_REQUIRED;
    const sent = await this.#send({
      outage,
      impactCase,
      patient,
      recipientType: "GUARDIAN",
      recipientId: target.contact.id ?? target.contact.phone,
      to: target.contact.phone,
      templateType,
      variables: { patientName: patient.name, reason: impactCase.riskReason },
      escalationRound: target.nextEscalationRound - 1,
      now,
    });
    if (!deliveryAccepted(sent)) return { impactCase, notified: "NONE", ...deliveryFailure(sent) };

    impactCase.escalationRound = target.nextEscalationRound;
    impactCase.updatedAt = new Date(now).toISOString();
    let institutionResult = null;
    if (impactCase.riskLevel === "CRITICAL") {
      institutionResult = await this.#notifyInstitution({ outage, impactCase, patient, escalationRound: target.nextEscalationRound - 1, now });
    }
    return { impactCase, notified: "GUARDIAN", contact: target.contact, delivery: sent.delivery, institutionResult };
  }

  async #notifyInstitution({ outage, impactCase, patient, escalationRound, now }) {
    const to = this.#institutionPhone(patient);
    if (!to) return { sent: false, error: "NO_RECIPIENT_AVAILABLE" };
    const result = await this.#send({
      outage,
      impactCase,
      patient,
      recipientType: "INSTITUTION",
      recipientId: "INSTITUTION",
      to,
      templateType: NotificationType.CRITICAL_ALERT,
      variables: { patientName: patient.name, reason: impactCase.riskReason },
      escalationRound,
      now,
    });
    if (!deliveryAccepted(result)) return { sent: false, ...deliveryFailure(result) };
    return { sent: true, delivery: result.delivery };
  }

  #institutionPhone(patient) {
    const contact = (patient.institutionContacts ?? [])[0];
    return contact?.phone ?? null;
  }

  #recomputeSafetyTime(patient, outage, now) {
    const profile = patient.powerProfile ?? {};
    return calculateSafetyTime({
      batteryRuntimeMinutes: profile.batteryRuntimeMinutes,
      safetyBufferMinutes: profile.safetyBufferMinutes,
      verifiedBackupRuntimeMinutes: profile.verifiedBackupRuntimeMinutes ?? 0,
      outageStartedAt: outage.startedAt ?? outage.scheduledStartAt,
      now,
    });
  }

  async #send({
    outage,
    impactCase,
    patient,
    recipientType,
    recipientId,
    to,
    templateType,
    variables,
    escalationRound,
    responseTokenReservationId = null,
    now,
  }) {
    const fallbackText = this.templateRenderer(templateType, variables);
    const content = this.messageComposer
      ? await this.messageComposer.compose({
          templateType,
          recipientType,
          patient,
          outage,
          impactCase,
          variables,
        })
      : {
          text: fallbackText,
          source: "TEMPLATE",
          policyVersion: null,
          model: null,
          requestId: null,
          fallbackReason: null,
        };
    return this.notificationService.send({
      mode: outage.mode,
      outageId: outage.id,
      impactCaseId: impactCase.id,
      recipientType,
      recipientId,
      to,
      templateType,
      text: content.text,
      escalationRound,
      responseTokenReservationId,
      contentMetadata: content,
      now,
    });
  }
}

export { STATUS_CHECK_PURPOSE };
