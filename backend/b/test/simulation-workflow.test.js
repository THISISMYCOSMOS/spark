import test from "node:test";
import assert from "node:assert/strict";

import {
  ImpactCaseStatus,
  InMemoryJobQueue,
  MockSmsProvider,
  Mode,
  NotificationService,
  OutageStatus,
  OutageWorkflow,
  RiskLevel,
  SimulationEngine,
  StatusCheckStatus,
  TestResponseLinkIssuer,
} from "../src/index.js";

const patient = {
  id: "patient-1",
  name: "테스트 환자",
  phone: "01000000000",
  regionCode: "11260",
  powerProfile: { batteryRuntimeMinutes: 120, safetyBufferMinutes: 30 },
  emergencyContacts: [
    { id: "g1", phone: "01099999991", contactOrder: 1 },
    { id: "g2", phone: "01099999992", contactOrder: 2 },
  ],
  institutionContacts: [{ phone: "01099999900" }],
};

function buildWorkflow({ provider = new MockSmsProvider(), jobQueue = new InMemoryJobQueue() } = {}) {
  const notificationService = new NotificationService({ testProvider: provider });
  const responseLinkIssuer = new TestResponseLinkIssuer({ baseUrl: "https://example.test" });
  const workflow = new OutageWorkflow({ notificationService, responseLinkIssuer, jobQueue });
  return { workflow, provider, jobQueue, notificationService, responseLinkIssuer };
}

test("시뮬레이션은 TEST 데이터만 만들고 시간 경과와 복구를 재계산하며 복구는 기존 위험도를 보존한다", () => {
  const engine = new SimulationEngine({
    patients: [patient],
    startAt: "2026-08-13T10:00:00.000Z",
  });
  const started = engine.startOutage({ id: "outage-1", regionCode: "11260" });
  assert.equal(started.outage.mode, Mode.TEST);
  assert.equal(started.created[0].safetyTime.remainingMinutes, 90);

  const elapsed = engine.advanceTime(90);
  assert.equal(elapsed.impactCases[0].safetyTime.remainingMinutes, 0);
  assert.equal(elapsed.impactCases[0].riskLevel, RiskLevel.CRITICAL);

  const recovered = engine.reportRecovery("outage-1");
  assert.equal(recovered.outages[0].status, OutageStatus.RECOVERY_REPORTED);
  assert.equal(recovered.impactCases[0].status, ImpactCaseStatus.RECOVERY_CHECK);
  // Regional recovery changes workflow status only; risk is preserved, never overwritten (v0.1 #4).
  assert.equal(recovered.impactCases[0].riskLevel, RiskLevel.CRITICAL);
  assert.throws(() => engine.startOutage({ mode: Mode.LIVE }), /SIMULATION_REQUIRES_TEST_MODE/);
});

test("예고 정전 준비 문자는 환자와 1순위 보호자에게만 발송한다", async () => {
  const { workflow, provider } = buildWorkflow();
  const outage = {
    id: "outage-scheduled-1",
    mode: Mode.TEST,
    status: OutageStatus.SCHEDULED,
    regionCode: "11260",
    scheduledStartAt: "2026-08-14T10:00:00.000Z",
  };

  const started = await workflow.start({ outage, patients: [patient], now: "2026-08-13T10:00:00.000Z" });

  assert.deepEqual(provider.messages.map((message) => message.to), [patient.phone, patient.emergencyContacts[0].phone]);
  assert.equal(provider.messages.some((message) => message.to === patient.emergencyContacts[1].phone), false);
  assert.deepEqual(started.preparationResults, [{
    impactCaseId: started.created[0].id,
    patientNotified: true,
    guardianNotified: true,
    guardianId: patient.emergencyContacts[0].id,
  }]);
});

test("예고 정전 대상 환자에게 보호자가 없어도 환자 문자를 발송하고 결과를 명시한다", async () => {
  const { workflow, provider } = buildWorkflow();
  const noGuardianPatient = { ...patient, emergencyContacts: [] };
  const outage = {
    id: "outage-scheduled-2",
    mode: Mode.TEST,
    status: OutageStatus.SCHEDULED,
    regionCode: "11260",
    scheduledStartAt: "2026-08-14T10:00:00.000Z",
  };

  const started = await workflow.start({
    outage,
    patients: [noGuardianPatient],
    now: "2026-08-13T10:00:00.000Z",
  });

  assert.deepEqual(provider.messages.map((message) => message.to), [noGuardianPatient.phone]);
  assert.deepEqual(started.preparationResults, [{
    impactCaseId: started.created[0].id,
    patientNotified: true,
    guardianNotified: false,
    reason: "NO_GUARDIAN_AVAILABLE",
  }]);
});

test("최초 환자 문자 접수 성공 시 공급자 접수 시각부터 StatusCheck와 링크, timeout 작업을 시작한다", async () => {
  const providerAcceptedAt = "2026-08-13T10:00:03.000Z";
  const provider = new MockSmsProvider({ acceptedAtFactory: () => providerAcceptedAt });
  const { workflow, jobQueue, responseLinkIssuer } = buildWorkflow({ provider });
  const outage = {
    id: "outage-status-success",
    mode: Mode.TEST,
    status: OutageStatus.ACTIVE,
    regionCode: "11260",
    startedAt: "2026-08-13T10:00:00.000Z",
  };

  const started = await workflow.start({ outage, patients: [patient], now: outage.startedAt });
  const result = started.statusCheckResults[0];
  const statusCheck = started.statusChecks[0];

  assert.equal(result.started, true);
  assert.equal(result.delivery.providerAcceptedAt, providerAcceptedAt);
  assert.equal(statusCheck.requestedAt, providerAcceptedAt);
  assert.equal(statusCheck.timeoutAt, "2026-08-13T10:00:13.000Z");
  assert.equal(statusCheck.responseLink.expiresAt, statusCheck.timeoutAt);
  assert.equal(responseLinkIssuer.activations[0].expiresAt, statusCheck.timeoutAt);
  assert.equal(result.job.runAt, statusCheck.timeoutAt);
  assert.equal(jobQueue.jobs.size, 1);
});

test("최초 환자 문자 실패 시 StatusCheck와 timeout 작업을 시작하지 않고 재시도 성공 시점부터 시작한다", async () => {
  const retryAcceptedAt = "2026-08-13T10:01:00.000Z";
  const provider = new MockSmsProvider({
    failRecipients: [patient.phone],
    acceptedAtFactory: () => retryAcceptedAt,
  });
  const { workflow, jobQueue, notificationService, responseLinkIssuer } = buildWorkflow({ provider });
  const outage = {
    id: "outage-status-retry",
    mode: Mode.TEST,
    status: OutageStatus.ACTIVE,
    regionCode: "11260",
    startedAt: "2026-08-13T10:00:00.000Z",
  };

  const started = await workflow.start({ outage, patients: [patient], now: outage.startedAt });
  const failed = started.statusCheckResults[0];

  assert.equal(started.statusChecks.length, 0);
  assert.equal(jobQueue.jobs.size, 0);
  assert.equal(failed.started, false);
  assert.equal(failed.status, "STATUS_CHECK_NOT_STARTED");
  assert.equal(failed.delivery.providerAcceptedAt, undefined);
  assert.equal(responseLinkIssuer.activations.length, 0);

  provider.failRecipients.delete(patient.phone);
  await notificationService.retryFailed(failed.delivery.id);
  const resumed = await workflow.startStatusCheckAfterSuccessfulRetry({
    impactCase: started.created[0],
    statusCheckResult: failed,
  });

  assert.equal(resumed.started, true);
  assert.equal(resumed.statusCheck.requestedAt, retryAcceptedAt);
  assert.equal(resumed.statusCheck.timeoutAt, "2026-08-13T10:01:10.000Z");
  assert.equal(resumed.link.expiresAt, resumed.statusCheck.timeoutAt);
  assert.equal(jobQueue.jobs.size, 1);
});

test("무응답 보호자 알림은 한 라운드에 한 명씩 순차적으로 진행되고 모두 대응 불가면 기관으로 넘어간다", async () => {
  const { workflow, provider, jobQueue } = buildWorkflow();
  const outage = {
    id: "outage-1",
    mode: Mode.TEST,
    status: OutageStatus.ACTIVE,
    regionCode: "11260",
    startedAt: "2026-08-13T10:00:00.000Z",
  };

  const started = await workflow.start({ outage, patients: [patient], now: outage.startedAt });
  const impactCase = started.created[0];
  assert.equal(impactCase.status, ImpactCaseStatus.WAITING_PATIENT);
  assert.equal(provider.messages.length, 1);
  assert.equal(provider.messages[0].to, patient.phone);
  assert.equal(jobQueue.jobs.size, 1);

  await workflow.handleStatusCheckTimeout({
    impactCase,
    statusCheck: started.statusChecks[0],
    patient,
    outage,
    now: "2026-08-13T10:00:10.000Z",
  });
  assert.equal(impactCase.status, ImpactCaseStatus.ACTION_REQUIRED);
  assert.equal(provider.messages.length, 2);
  assert.equal(provider.messages[1].to, patient.emergencyContacts[0].phone);
  assert.equal(impactCase.escalationRound, 1);

  const riskBeforeNextGuardian = impactCase.riskLevel;
  const secondRound = await workflow.escalateToNextGuardian({
    outage,
    impactCase,
    patient,
    guardianAction: { status: "UNAVAILABLE" },
    now: "2026-08-13T10:01:00.000Z",
  });
  assert.equal(secondRound.notified, "GUARDIAN");
  assert.equal(provider.messages.length, 3);
  assert.equal(provider.messages[2].to, patient.emergencyContacts[1].phone);
  assert.equal(impactCase.escalationRound, 2);

  const thirdRound = await workflow.escalateToNextGuardian({
    outage,
    impactCase,
    patient,
    guardianAction: { status: "UNAVAILABLE" },
    now: "2026-08-13T10:02:00.000Z",
  });
  assert.equal(thirdRound.notified, "INSTITUTION");
  // Exactly one recipient per round throughout — never a broadcast to every guardian at once.
  assert.equal(provider.messages.length, 4);
  assert.equal(provider.messages[3].to, patient.institutionContacts[0].phone);
  assert.equal(impactCase.riskLevel, riskBeforeNextGuardian);
});

test("보호자도 기관 연락처도 없으면 에스컬레이션은 명시적으로 수신자 없음을 반환하고 문자를 보내지 않는다", async () => {
  const { workflow, provider } = buildWorkflow();
  const noContactPatient = { ...patient, emergencyContacts: [], institutionContacts: [] };
  const outage = {
    id: "outage-3",
    mode: Mode.TEST,
    status: OutageStatus.ACTIVE,
    regionCode: "11260",
    startedAt: "2026-08-13T10:00:00.000Z",
  };
  const started = await workflow.start({ outage, patients: [noContactPatient], now: outage.startedAt });
  const impactCase = started.created[0];
  const before = provider.messages.length;

  const riskBefore = impactCase.riskLevel;
  const result = await workflow.escalateToNextGuardian({
    outage,
    impactCase,
    patient: noContactPatient,
    guardianAction: { status: "UNAVAILABLE" },
    now: "2026-08-13T10:00:10.000Z",
  });
  assert.equal(result.notified, "NONE");
  assert.equal(result.error, "NO_RECIPIENT_AVAILABLE");
  assert.equal(provider.messages.length, before);
  assert.equal(impactCase.riskLevel, riskBefore);
});

test("보호자 근거가 없거나 완료·대응 중이면 다음 보호자로 이동하지 않고 위험도를 유지한다", async () => {
  const scenarios = [
    { guardianAction: null, reason: "GUARDIAN_EVIDENCE_REQUIRED" },
    { guardianAction: { status: "COMPLETED" }, reason: "GUARDIAN_ACTION_COMPLETED" },
    { guardianAction: { status: "IN_PROGRESS" }, reason: "GUARDIAN_ACTION_PENDING" },
  ];
  const outage = { id: "outage-guardian-skip", mode: Mode.TEST };

  for (const [index, scenario] of scenarios.entries()) {
    const { workflow, provider } = buildWorkflow();
    const impactCase = {
      id: `case-guardian-skip-${index}`,
      outageId: outage.id,
      mode: Mode.TEST,
      status: ImpactCaseStatus.GUARDIAN_ACTING,
      escalationRound: 1,
      riskLevel: RiskLevel.HIGH,
    };

    const result = await workflow.escalateToNextGuardian({
      outage,
      impactCase,
      patient,
      guardianAction: scenario.guardianAction,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, scenario.reason);
    assert.equal(impactCase.escalationRound, 1);
    assert.equal(provider.messages.length, 0);
    assert.equal(impactCase.riskLevel, RiskLevel.HIGH);
  }
});

test("이미 완료된 대응은 추가 에스컬레이션 없이 위험도를 유지한다", async () => {
  const { workflow, provider } = buildWorkflow();
  const impactCase = {
    id: "case-guardian-closed",
    outageId: "outage-guardian-closed",
    mode: Mode.TEST,
    status: ImpactCaseStatus.CLOSED,
    escalationRound: 1,
    riskLevel: RiskLevel.CRITICAL,
  };

  const result = await workflow.escalateToNextGuardian({
    outage: { id: impactCase.outageId, mode: Mode.TEST },
    impactCase,
    patient,
    guardianAction: { status: "UNAVAILABLE" },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "GUARDIAN_ACTION_COMPLETED");
  assert.equal(impactCase.escalationRound, 1);
  assert.equal(provider.messages.length, 0);
  assert.equal(impactCase.riskLevel, RiskLevel.CRITICAL);
});

test("UNAVAILABLE 또는 timeout 근거가 있으면 한 호출에 다음 보호자 한 명에게만 이동한다", async () => {
  const evidenceCases = [
    { guardianAction: { status: "UNAVAILABLE" } },
    { guardianActionTimedOut: true },
  ];

  for (const [index, evidence] of evidenceCases.entries()) {
    const { workflow, provider } = buildWorkflow();
    const impactCase = {
      id: `case-guardian-next-${index}`,
      outageId: "outage-guardian-next",
      mode: Mode.TEST,
      status: ImpactCaseStatus.GUARDIAN_ACTING,
      escalationRound: 1,
      riskLevel: RiskLevel.HIGH,
      riskReason: "STATUS_CHECK_TIMED_OUT",
    };

    const result = await workflow.escalateToNextGuardian({
      outage: { id: impactCase.outageId, mode: Mode.TEST },
      impactCase,
      patient,
      ...evidence,
    });

    assert.equal(result.notified, "GUARDIAN");
    assert.equal(impactCase.escalationRound, 2);
    assert.deepEqual(provider.messages.map((message) => message.to), [patient.emergencyContacts[1].phone]);
    assert.equal(impactCase.riskLevel, RiskLevel.HIGH);
  }
});

test("마지막 보호자의 UNAVAILABLE 또는 timeout 근거가 있으면 기관으로 이동하고 위험도를 유지한다", async () => {
  const evidenceCases = [
    { guardianAction: { status: "UNAVAILABLE" } },
    { guardianActionTimedOut: true },
  ];

  for (const [index, evidence] of evidenceCases.entries()) {
    const { workflow, provider } = buildWorkflow();
    const impactCase = {
      id: `case-guardian-institution-${index}`,
      outageId: "outage-guardian-institution",
      mode: Mode.TEST,
      status: ImpactCaseStatus.GUARDIAN_ACTING,
      escalationRound: 2,
      riskLevel: RiskLevel.HIGH,
      riskReason: "STATUS_CHECK_TIMED_OUT",
    };

    const result = await workflow.escalateToNextGuardian({
      outage: { id: impactCase.outageId, mode: Mode.TEST },
      impactCase,
      patient,
      ...evidence,
    });

    assert.equal(result.notified, "INSTITUTION");
    assert.deepEqual(provider.messages.map((message) => message.to), [patient.institutionContacts[0].phone]);
    assert.equal(impactCase.riskLevel, RiskLevel.HIGH);
  }
});

test("마지막 보호자 이후 기관 연락처가 없으면 SMS Provider를 호출하지 않고 위험도를 유지한다", async () => {
  const { workflow, provider } = buildWorkflow();
  const patientWithoutInstitution = { ...patient, institutionContacts: [] };
  const impactCase = {
    id: "case-guardian-no-institution",
    outageId: "outage-guardian-no-institution",
    mode: Mode.TEST,
    status: ImpactCaseStatus.GUARDIAN_ACTING,
    escalationRound: 2,
    riskLevel: RiskLevel.CRITICAL,
  };

  const result = await workflow.escalateToNextGuardian({
    outage: { id: impactCase.outageId, mode: Mode.TEST },
    impactCase,
    patient: patientWithoutInstitution,
    guardianActionTimedOut: true,
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "NO_RECIPIENT_AVAILABLE");
  assert.equal(provider.messages.length, 0);
  assert.equal(impactCase.riskLevel, RiskLevel.CRITICAL);
});

test("복구 재확인도 보호자·기관 연락처가 없으면 명시적으로 수신자 없음을 반환하고 문자를 보내지 않는다", async () => {
  const { workflow, provider } = buildWorkflow();
  const noContactPatient = { ...patient, emergencyContacts: [], institutionContacts: [] };
  const impactCase = {
    id: "case-x",
    outageId: "outage-4",
    mode: Mode.TEST,
    recoveryEscalationRound: 0,
    riskLevel: RiskLevel.CRITICAL,
  };
  const before = provider.messages.length;

  const result = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient: noContactPatient,
    statusCheck: { status: StatusCheckStatus.TIMED_OUT },
    now: "2026-08-13T10:00:00.000Z",
  });
  assert.equal(result.notified, "NONE");
  assert.equal(result.error, "NO_RECIPIENT_AVAILABLE");
  assert.equal(provider.messages.length, before);
  assert.equal(impactCase.riskLevel, RiskLevel.CRITICAL);
});

test("복구 확인이 PENDING이면 제한시간 전 보호자에게 발송하지 않고 위험도를 유지한다", async () => {
  const { workflow, provider } = buildWorkflow();
  const impactCase = {
    id: "case-recovery-pending",
    outageId: "outage-recovery",
    mode: Mode.TEST,
    status: ImpactCaseStatus.RECOVERY_CHECK,
    recoveryEscalationRound: 0,
    riskLevel: RiskLevel.CRITICAL,
  };

  const result = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    statusCheck: { status: StatusCheckStatus.PENDING, timeoutAt: "2026-08-13T10:00:10.000Z" },
    now: "2026-08-13T10:00:05.000Z",
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "RECOVERY_CHECK_PENDING");
  assert.equal(provider.messages.length, 0);
  assert.equal(impactCase.riskLevel, RiskLevel.CRITICAL);
});

test("전력과 기기가 모두 정상인 복구 확인은 보호자에게 발송하지 않고 위험도를 유지한다", async () => {
  const { workflow, provider } = buildWorkflow();
  const impactCase = {
    id: "case-recovery-confirmed",
    outageId: "outage-recovery",
    mode: Mode.TEST,
    status: ImpactCaseStatus.RECOVERY_CHECK,
    recoveryEscalationRound: 0,
    riskLevel: RiskLevel.HIGH,
  };

  const result = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    statusCheck: { status: StatusCheckStatus.RESPONDED },
    recoveryConfirmation: { homePowerRestored: true, deviceOperatingNormally: true },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "RECOVERY_CONFIRMED");
  assert.equal(provider.messages.length, 0);
  assert.equal(impactCase.riskLevel, RiskLevel.HIGH);
});

test("이미 완료됐거나 근거가 없는 복구 확인은 보호자에게 발송하지 않고 위험도를 유지한다", async () => {
  for (const scenario of [
    { status: ImpactCaseStatus.CLOSED, reason: "RECOVERY_ALREADY_COMPLETED" },
    { status: ImpactCaseStatus.RECOVERY_CHECK, reason: "RECOVERY_EVIDENCE_REQUIRED" },
  ]) {
    const { workflow, provider } = buildWorkflow();
    const impactCase = {
      id: `case-${scenario.reason}`,
      outageId: "outage-recovery",
      mode: Mode.TEST,
      status: scenario.status,
      recoveryEscalationRound: 0,
      riskLevel: RiskLevel.CRITICAL,
    };

    const result = await workflow.handleRecoveryTimeoutOrUnconfirmed({ impactCase, patient });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, scenario.reason);
    assert.equal(provider.messages.length, 0);
    assert.equal(impactCase.riskLevel, RiskLevel.CRITICAL);
  }
});

test("복구 timeout 또는 명시적 미복구 근거가 있으면 1순위 보호자에게만 발송하고 위험도를 유지한다", async () => {
  const evidenceCases = [
    { statusCheck: { status: StatusCheckStatus.TIMED_OUT }, recoveryConfirmation: null },
    { statusCheck: { status: StatusCheckStatus.RESPONDED }, recoveryConfirmation: { homePowerRestored: false } },
    { statusCheck: { status: StatusCheckStatus.RESPONDED }, recoveryConfirmation: { deviceOperatingNormally: false } },
  ];

  for (const [index, evidence] of evidenceCases.entries()) {
    const { workflow, provider } = buildWorkflow();
    const impactCase = {
      id: `case-recovery-evidence-${index}`,
      outageId: "outage-recovery",
      mode: Mode.TEST,
      status: ImpactCaseStatus.RECOVERY_CHECK,
      recoveryEscalationRound: 0,
      riskLevel: RiskLevel.HIGH,
    };

    const result = await workflow.handleRecoveryTimeoutOrUnconfirmed({ impactCase, patient, ...evidence });

    assert.equal(result.notified, "GUARDIAN");
    assert.deepEqual(provider.messages.map((message) => message.to), [patient.emergencyContacts[0].phone]);
    assert.equal(provider.messages.some((message) => message.to === patient.emergencyContacts[1].phone), false);
    assert.equal(impactCase.riskLevel, RiskLevel.HIGH);
  }
});

test("지역 복구는 환자에게 먼저 확인을 요청하고 보호자는 복구 타임아웃/미확인 시에만 연락하며 기존 위험도를 보존한다", async () => {
  const { workflow, provider } = buildWorkflow();
  const outage = {
    id: "outage-2",
    mode: Mode.TEST,
    status: OutageStatus.ACTIVE,
    regionCode: "11260",
    startedAt: "2026-08-13T10:00:00.000Z",
  };
  const started = await workflow.start({ outage, patients: [patient], now: outage.startedAt });
  const impactCase = started.created[0];

  await workflow.handleStatusCheckTimeout({
    impactCase,
    statusCheck: started.statusChecks[0],
    patient,
    outage,
    now: "2026-08-13T10:00:10.000Z",
  });
  const riskBeforeRecovery = impactCase.riskLevel;
  const messagesBeforeRecovery = provider.messages.length;

  const recovery = await workflow.reportRecovery({
    outage,
    impactCases: [impactCase],
    patients: [patient],
    now: "2026-08-13T10:05:00.000Z",
  });
  assert.equal(impactCase.status, ImpactCaseStatus.RECOVERY_CHECK);
  assert.equal(impactCase.riskLevel, riskBeforeRecovery);
  assert.equal(provider.messages.length, messagesBeforeRecovery + 1);
  assert.equal(provider.messages.at(-1).to, patient.phone);
  assert.equal(recovery.statusChecks[0].purpose, "RECOVERY_CONFIRMATION");

  const firstGuardian = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    statusCheck: { status: StatusCheckStatus.TIMED_OUT },
    now: "2026-08-13T10:15:00.000Z",
  });
  assert.equal(firstGuardian.notified, "GUARDIAN");
  assert.equal(provider.messages.at(-1).to, patient.emergencyContacts[0].phone);
  assert.equal(impactCase.riskLevel, riskBeforeRecovery);

  const secondGuardian = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    statusCheck: { status: StatusCheckStatus.TIMED_OUT },
    now: "2026-08-13T10:20:00.000Z",
  });
  assert.equal(secondGuardian.notified, "GUARDIAN");
  assert.equal(provider.messages.at(-1).to, patient.emergencyContacts[1].phone);
  assert.equal(impactCase.riskLevel, riskBeforeRecovery);

  const institution = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    statusCheck: { status: StatusCheckStatus.TIMED_OUT },
    now: "2026-08-13T10:25:00.000Z",
  });
  assert.equal(institution.notified, "INSTITUTION");
  assert.equal(provider.messages.at(-1).to, patient.institutionContacts[0].phone);
  // Recovery escalation never touches riskLevel, from patient ask through institution handoff.
  assert.equal(impactCase.riskLevel, riskBeforeRecovery);
});
