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
  return { workflow, provider, jobQueue };
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

  const secondRound = await workflow.escalateToNextGuardian({ outage, impactCase, patient, now: "2026-08-13T10:01:00.000Z" });
  assert.equal(secondRound.notified, "GUARDIAN");
  assert.equal(provider.messages.length, 3);
  assert.equal(provider.messages[2].to, patient.emergencyContacts[1].phone);
  assert.equal(impactCase.escalationRound, 2);

  const thirdRound = await workflow.escalateToNextGuardian({ outage, impactCase, patient, now: "2026-08-13T10:02:00.000Z" });
  assert.equal(thirdRound.notified, "INSTITUTION");
  // Exactly one recipient per round throughout — never a broadcast to every guardian at once.
  assert.equal(provider.messages.length, 4);
  assert.equal(provider.messages[3].to, patient.institutionContacts[0].phone);
  assert.equal(impactCase.riskLevel, RiskLevel.CRITICAL);
  assert.equal(impactCase.riskReason, "ALL_GUARDIANS_UNAVAILABLE");
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

  const result = await workflow.escalateToNextGuardian({ outage, impactCase, patient: noContactPatient, now: "2026-08-13T10:00:10.000Z" });
  assert.equal(result.notified, "NONE");
  assert.equal(result.error, "NO_RECIPIENT_AVAILABLE");
  assert.equal(provider.messages.length, before);
});

test("복구 재확인도 보호자·기관 연락처가 없으면 명시적으로 수신자 없음을 반환하고 문자를 보내지 않는다", async () => {
  const { workflow, provider } = buildWorkflow();
  const noContactPatient = { ...patient, emergencyContacts: [], institutionContacts: [] };
  const impactCase = { id: "case-x", outageId: "outage-4", mode: Mode.TEST, recoveryEscalationRound: 0 };
  const before = provider.messages.length;

  const result = await workflow.handleRecoveryTimeoutOrUnconfirmed({ impactCase, patient: noContactPatient, now: "2026-08-13T10:00:00.000Z" });
  assert.equal(result.notified, "NONE");
  assert.equal(result.error, "NO_RECIPIENT_AVAILABLE");
  assert.equal(provider.messages.length, before);
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
    now: "2026-08-13T10:15:00.000Z",
  });
  assert.equal(firstGuardian.notified, "GUARDIAN");
  assert.equal(provider.messages.at(-1).to, patient.emergencyContacts[0].phone);
  assert.equal(impactCase.riskLevel, riskBeforeRecovery);

  const secondGuardian = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    now: "2026-08-13T10:20:00.000Z",
  });
  assert.equal(secondGuardian.notified, "GUARDIAN");
  assert.equal(provider.messages.at(-1).to, patient.emergencyContacts[1].phone);
  assert.equal(impactCase.riskLevel, riskBeforeRecovery);

  const institution = await workflow.handleRecoveryTimeoutOrUnconfirmed({
    impactCase,
    patient,
    now: "2026-08-13T10:25:00.000Z",
  });
  assert.equal(institution.notified, "INSTITUTION");
  assert.equal(provider.messages.at(-1).to, patient.institutionContacts[0].phone);
  // Recovery escalation never touches riskLevel, from patient ask through institution handoff.
  assert.equal(impactCase.riskLevel, riskBeforeRecovery);
});
