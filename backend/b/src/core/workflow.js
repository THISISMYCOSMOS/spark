import { DeliveryStatus, ImpactCaseStatus, OutageStatus, PatientResponse, StatusCheckStatus } from "../contracts.js";
import { createImpactCases } from "./matching.js";
import { DEMO_ONLY_RISK_POLICY, evaluateRisk } from "./risk.js";
import { calculateSafetyTime } from "./safety-time.js";
import { createStatusCheck, isStatusCheckDue, respondToStatusCheck, timeoutStatusCheck } from "./status-check.js";
import { selectEscalationTarget } from "./escalation.js";
import { JobType } from "../jobs/queue.js";
import { NotificationType, renderTemplate } from "../notifications/templates.js";

const STATUS_CHECK_PURPOSE = Object.freeze({
  OUTAGE_STATUS: "OUTAGE_STATUS",
  RECOVERY_CONFIRMATION: "RECOVERY_CONFIRMATION",
});

/**
 * Orchestrates workflow decisions: which StatusCheck/notification/job to
 * create next. It mutates the plain ImpactCase/StatusCheck objects it is
 * handed and returns them — Backend 1 is responsible for persisting whatever
 * it gets back. Nothing here is a database.
 */
export class OutageWorkflow {
  constructor({
    notificationService,
    responseLinkIssuer,
    jobQueue,
    riskPolicy = DEMO_ONLY_RISK_POLICY,
    templateRenderer = renderTemplate,
  }) {
    this.notificationService = notificationService;
    this.responseLinkIssuer = responseLinkIssuer;
    this.jobQueue = jobQueue;
    this.riskPolicy = riskPolicy;
    this.templateRenderer = templateRenderer;
  }

  /** Creates ImpactCases for a newly registered/started outage and, for an
   * already-ACTIVE (unplanned or started) outage, sends the initial patient
   * status check. A SCHEDULED outage only gets a prepare notice to the patient. */
  async start({ outage, patients, existingCases = [], now = new Date() }) {
    const result = createImpactCases({ outage, patients, existingCases, now, riskPolicy: this.riskPolicy });
    const statusChecks = [];
    const statusCheckResults = [];
    const preparationResults = [];
    for (const impactCase of result.created) {
      const patient = patients.find((item) => item.id === impactCase.patientId);
      if (outage.status === OutageStatus.SCHEDULED) {
        await this.#send({
          outage,
          impactCase,
          recipientType: "PATIENT",
          recipientId: patient.id,
          to: patient.phone,
          templateType: NotificationType.PLANNED_OUTAGE_PREPARE,
          variables: { patientName: patient.name, startsAt: outage.scheduledStartAt },
          escalationRound: 0,
        });
        const target = selectEscalationTarget({ contacts: patient.emergencyContacts ?? [], escalationRound: 0 });
        if (target.exhausted) {
          preparationResults.push({
            impactCaseId: impactCase.id,
            patientNotified: true,
            guardianNotified: false,
            reason: "NO_GUARDIAN_AVAILABLE",
          });
          continue;
        }
        await this.#send({
          outage,
          impactCase,
          recipientType: "GUARDIAN",
          recipientId: target.contact.id ?? target.contact.phone,
          to: target.contact.phone,
          templateType: NotificationType.PLANNED_OUTAGE_PREPARE,
          variables: { patientName: patient.name, startsAt: outage.scheduledStartAt },
          escalationRound: 0,
        });
        preparationResults.push({
          impactCaseId: impactCase.id,
          patientNotified: true,
          guardianNotified: true,
          guardianId: target.contact.id ?? target.contact.phone,
        });
        continue;
      }
      const statusCheckResult = await this.#beginStatusCheck({
        outage,
        impactCase,
        patient,
        purpose: STATUS_CHECK_PURPOSE.OUTAGE_STATUS,
        now,
      });
      statusCheckResults.push(statusCheckResult);
      if (statusCheckResult.started) statusChecks.push(statusCheckResult.statusCheck);
    }
    return { ...result, statusChecks, statusCheckResults, preparationResults };
  }

  /** Patient answered NORMAL / EQUIPMENT_ISSUE / NEED_HELP before the timeout. */
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
    await this.#escalateGuardian({ outage, impactCase, patient, now });
    return { impactCase, statusCheck: respondedCheck };
  }

  /** No patient response by the deadline. Notifies the first contact only.
   * Refuses to time out and escalate before statusCheck.timeoutAt — a job
   * firing early (or being retried early) must not jump the deadline. */
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

    await this.#escalateGuardian({ outage, impactCase, patient, now });
    return { impactCase, statusCheck: timedOutCheck };
  }

  /** Backend 1 calls this once a guardian is persisted as UNAVAILABLE, to learn
   * who to contact next. Advances exactly one guardian per round; once every
   * contact has been tried, notifies the institution instead of broadcasting. */
  async escalateToNextGuardian({
    outage,
    impactCase,
    patient,
    guardianAction = null,
    guardianActionTimedOut = false,
    now = new Date(),
  }) {
    if (impactCase.status === ImpactCaseStatus.CLOSED || guardianAction?.status === "COMPLETED") {
      return { impactCase, notified: "NONE", skipped: true, reason: "GUARDIAN_ACTION_COMPLETED" };
    }
    if (guardianAction?.status !== "UNAVAILABLE" && guardianActionTimedOut !== true) {
      return {
        impactCase,
        notified: "NONE",
        skipped: true,
        reason: guardianAction ? "GUARDIAN_ACTION_PENDING" : "GUARDIAN_EVIDENCE_REQUIRED",
      };
    }
    return this.#escalateGuardian({ outage, impactCase, patient, now, preserveRisk: true });
  }

  /** Regional recovery: ask the patient first. Never touches riskLevel — prior
   * risk is preserved (v0.1 #4); only workflow status changes. */
  async reportRecovery({ outage, impactCases, patients, now = new Date() }) {
    const statusChecks = [];
    const statusCheckResults = [];
    for (const impactCase of impactCases) {
      const patient = patients.find((item) => item.id === impactCase.patientId);
      impactCase.recoveryEscalationRound = 0;
      const statusCheckResult = await this.#beginStatusCheck({
        outage,
        impactCase,
        patient,
        purpose: STATUS_CHECK_PURPOSE.RECOVERY_CONFIRMATION,
        now,
      });
      statusCheckResults.push(statusCheckResult);
      if (statusCheckResult.started) statusChecks.push(statusCheckResult.statusCheck);
    }
    return { impactCases, statusChecks, statusCheckResults };
  }

  /** Starts a check only after a previously failed patient notification has
   * been retried and accepted by the provider. */
  async startStatusCheckAfterSuccessfulRetry({ impactCase, statusCheckResult }) {
    if (statusCheckResult?.started !== false || statusCheckResult?.status !== "STATUS_CHECK_NOT_STARTED") {
      throw new Error("STATUS_CHECK_RETRY_CONTEXT_REQUIRED");
    }
    if (statusCheckResult.delivery?.status !== DeliveryStatus.SENT || !statusCheckResult.delivery.providerAcceptedAt) {
      return { ...statusCheckResult, status: "STATUS_CHECK_NOT_STARTED", reason: "NOTIFICATION_NOT_ACCEPTED" };
    }
    return this.#activateStatusCheck({
      impactCase,
      purpose: statusCheckResult.purpose,
      link: statusCheckResult.link,
      delivery: statusCheckResult.delivery,
    });
  }

  /** Recovery status check timed out or came back unconfirmed. Guardian is
   * only contacted at this point — never before recovery timeout/unconfirmed
   * result. Risk is never modified here. */
  async handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    statusCheck = null,
    recoveryConfirmation = null,
    now = new Date(),
  }) {
    if (impactCase.status === ImpactCaseStatus.CLOSED || recoveryConfirmation?.completed === true) {
      return { impactCase, notified: "NONE", skipped: true, reason: "RECOVERY_ALREADY_COMPLETED" };
    }
    if (statusCheck?.status === StatusCheckStatus.PENDING) {
      return { impactCase, notified: "NONE", skipped: true, reason: "RECOVERY_CHECK_PENDING" };
    }

    const homePowerRestored = recoveryConfirmation?.homePowerRestored;
    const deviceOperatingNormally = recoveryConfirmation?.deviceOperatingNormally;
    if (homePowerRestored === true && deviceOperatingNormally === true) {
      return { impactCase, notified: "NONE", skipped: true, reason: "RECOVERY_CONFIRMED" };
    }

    const timedOut = statusCheck?.status === StatusCheckStatus.TIMED_OUT;
    const explicitlyUnrestored = homePowerRestored === false || deviceOperatingNormally === false;
    if (!timedOut && !explicitlyUnrestored) {
      return { impactCase, notified: "NONE", skipped: true, reason: "RECOVERY_EVIDENCE_REQUIRED" };
    }

    const target = selectEscalationTarget({
      contacts: patient.emergencyContacts ?? [],
      escalationRound: impactCase.recoveryEscalationRound,
    });
    impactCase.recoveryEscalationRound = target.nextEscalationRound;
    impactCase.updatedAt = new Date(now).toISOString();

    if (target.exhausted) {
      const institutionPhone = this.#institutionPhone(patient);
      if (!institutionPhone) {
        return {
          impactCase,
          notified: "NONE",
          skipped: true,
          reason: "NO_RECIPIENT_AVAILABLE",
          error: "NO_RECIPIENT_AVAILABLE",
        };
      }
      await this.#send({
        outage: { id: impactCase.outageId, mode: impactCase.mode },
        impactCase,
        recipientType: "INSTITUTION",
        recipientId: "INSTITUTION",
        to: institutionPhone,
        templateType: NotificationType.RECOVERY_CONFIRMATION,
        variables: { patientName: patient.name, responseUrl: "" },
        escalationRound: target.nextEscalationRound,
      });
      return { impactCase, notified: "INSTITUTION" };
    }

    const issued = await this.responseLinkIssuer.issueLink({
      impactCaseId: impactCase.id,
      purpose: STATUS_CHECK_PURPOSE.RECOVERY_CONFIRMATION,
      now,
      expiresAt: new Date(new Date(now).getTime() + this.riskPolicy.responseTimeoutSeconds * 1000).toISOString(),
    });
    await this.#send({
      outage: { id: impactCase.outageId, mode: impactCase.mode },
      impactCase,
      recipientType: "GUARDIAN",
      recipientId: target.contact.id ?? target.contact.phone,
      to: target.contact.phone,
      templateType: NotificationType.RECOVERY_CONFIRMATION,
      variables: { patientName: patient.name, responseUrl: issued.url },
      escalationRound: target.nextEscalationRound - 1,
    });
    return { impactCase, notified: "GUARDIAN", contact: target.contact };
  }

  async #beginStatusCheck({ outage, impactCase, patient, purpose, now }) {
    const link = await this.responseLinkIssuer.reserveLink({
      impactCaseId: impactCase.id,
      purpose,
    });
    const templateType =
      purpose === STATUS_CHECK_PURPOSE.OUTAGE_STATUS
        ? NotificationType.OUTAGE_STATUS_CHECK
        : NotificationType.RECOVERY_CONFIRMATION;

    const sent = await this.#send({
      outage,
      impactCase,
      recipientType: "PATIENT",
      recipientId: patient.id,
      to: patient.phone,
      templateType,
      variables: { patientName: patient.name, responseUrl: link.url },
      escalationRound: 0,
      providerAcceptedAtFallback: now,
    });
    if (sent.delivery.status !== DeliveryStatus.SENT || !sent.delivery.providerAcceptedAt) {
      return {
        started: false,
        status: "STATUS_CHECK_NOT_STARTED",
        reason: "NOTIFICATION_FAILED",
        purpose,
        delivery: sent.delivery,
        link,
      };
    }
    return this.#activateStatusCheck({ impactCase, purpose, link, delivery: sent.delivery });
  }

  async #activateStatusCheck({ impactCase, purpose, link, delivery }) {
    const statusCheck = createStatusCheck({
      impactCaseId: impactCase.id,
      purpose,
      now: delivery.providerAcceptedAt,
      timeoutSeconds: this.riskPolicy.responseTimeoutSeconds,
    });
    const activatedLink = await this.responseLinkIssuer.activateLink({
      linkId: link.linkId,
      expiresAt: statusCheck.timeoutAt,
    });
    statusCheck.responseLink = { ...link, expiresAt: activatedLink.expiresAt };

    impactCase.status =
      purpose === STATUS_CHECK_PURPOSE.OUTAGE_STATUS ? ImpactCaseStatus.WAITING_PATIENT : ImpactCaseStatus.RECOVERY_CHECK;
    impactCase.updatedAt = statusCheck.requestedAt;

    const scheduled = this.jobQueue.schedule({
      type: purpose === STATUS_CHECK_PURPOSE.OUTAGE_STATUS ? JobType.STATUS_CHECK_TIMEOUT : JobType.RECOVERY_TIMEOUT,
      runAt: statusCheck.timeoutAt,
      payload: { impactCaseId: impactCase.id, statusCheckId: statusCheck.id },
      idempotencyKey: `${purpose}:${statusCheck.id}`,
    });

    return { started: true, status: "STATUS_CHECK_STARTED", statusCheck, link: statusCheck.responseLink, delivery, job: scheduled.job };
  }

  /** Notifies exactly one guardian for the current escalationRound. When every
   * contact has been tried, notifies the institution instead. When risk is
   * CRITICAL, the institution is also notified alongside the current guardian
   * — never all guardians at once. */
  async #escalateGuardian({ outage, impactCase, patient, now, preserveRisk = false }) {
    const target = selectEscalationTarget({
      contacts: patient.emergencyContacts ?? [],
      escalationRound: impactCase.escalationRound,
    });
    impactCase.escalationRound = target.nextEscalationRound;

    if (target.exhausted) {
      if (!preserveRisk) {
        const risk = evaluateRisk({ safetyTime: impactCase.safetyTime, allGuardiansUnavailable: true, policy: this.riskPolicy });
        impactCase.riskLevel = risk.level;
        impactCase.riskReason = risk.reason;
        impactCase.policyId = risk.policyId;
        impactCase.policyVersion = risk.policyVersion;
      }
      impactCase.updatedAt = new Date(now).toISOString();
      const institutionResult = await this.#notifyInstitution({ outage, impactCase, patient, escalationRound: target.nextEscalationRound });
      if (!institutionResult.sent) {
        return {
          impactCase,
          notified: "NONE",
          skipped: true,
          reason: "NO_RECIPIENT_AVAILABLE",
          error: "NO_RECIPIENT_AVAILABLE",
        };
      }
      return { impactCase, notified: "INSTITUTION" };
    }

    const templateType =
      impactCase.riskLevel === "CRITICAL" ? NotificationType.CRITICAL_ALERT : NotificationType.GUARDIAN_ACTION_REQUIRED;
    await this.#send({
      outage,
      impactCase,
      recipientType: "GUARDIAN",
      recipientId: target.contact.id ?? target.contact.phone,
      to: target.contact.phone,
      templateType,
      variables: { patientName: patient.name, reason: impactCase.riskReason },
      escalationRound: target.nextEscalationRound - 1,
    });

    if (impactCase.riskLevel === "CRITICAL") {
      await this.#notifyInstitution({ outage, impactCase, patient, escalationRound: target.nextEscalationRound - 1 });
    }
    return { impactCase, notified: "GUARDIAN", contact: target.contact };
  }

  async #notifyInstitution({ outage, impactCase, patient, escalationRound }) {
    const to = this.#institutionPhone(patient);
    if (!to) return { sent: false };
    await this.#send({
      outage,
      impactCase,
      recipientType: "INSTITUTION",
      recipientId: "INSTITUTION",
      to,
      templateType: NotificationType.CRITICAL_ALERT,
      variables: { patientName: patient.name, reason: impactCase.riskReason },
      escalationRound,
    });
    return { sent: true };
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
    recipientType,
    recipientId,
    to,
    templateType,
    variables,
    escalationRound,
    providerAcceptedAtFallback = null,
  }) {
    return this.notificationService.send({
      mode: outage.mode,
      outageId: outage.id,
      impactCaseId: impactCase.id,
      recipientType,
      recipientId,
      to,
      templateType,
      text: this.templateRenderer(templateType, variables),
      escalationRound,
      providerAcceptedAtFallback,
    });
  }
}

export { STATUS_CHECK_PURPOSE };
