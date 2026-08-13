import test from "node:test";
import assert from "node:assert/strict";

import {
  DEMO_ONLY_RISK_POLICY,
  ImpactCaseStatus,
  Mode,
  OutageStatus,
  PatientResponse,
  RiskLevel,
  SafetyTimeStatus,
  StatusCheckStatus,
  calculatePlannedOutageShortfall,
  calculateSafetyTime,
  cancelStatusCheck,
  canCloseImpactCase,
  canCloseOutage,
  createImpactCases,
  createStatusCheck,
  evaluateRisk,
  isStatusCheckDue,
  matchPatientToOutage,
  respondToStatusCheck,
  selectEscalationTarget,
  timeoutStatusCheck,
} from "../src/index.js";

// --- safety-time ---------------------------------------------------------

test("안전시간은 등록 자립시간, 검증된 보조전원, 안전 버퍼, 경과시간, 남은 비율을 반영한다", () => {
  const result = calculateSafetyTime({
    batteryRuntimeMinutes: 240,
    verifiedBackupRuntimeMinutes: 30,
    safetyBufferMinutes: 30,
    outageStartedAt: "2026-08-13T10:00:00.000Z",
    now: "2026-08-13T11:30:00.000Z",
  });

  assert.deepEqual(result, {
    status: SafetyTimeStatus.KNOWN,
    effectiveRuntimeMinutes: 240,
    elapsedMinutes: 90,
    remainingMinutes: 150,
    remainingRatio: 150 / 240,
    reason: null,
  });
});

test("유효 자립시간이 0이면 남은 비율도 0이며 NaN이 되지 않는다", () => {
  const result = calculateSafetyTime({
    batteryRuntimeMinutes: 10,
    safetyBufferMinutes: 15,
    outageStartedAt: "2026-08-13T10:00:00.000Z",
    now: "2026-08-13T10:00:00.000Z",
  });
  assert.equal(result.status, SafetyTimeStatus.KNOWN);
  assert.equal(result.effectiveRuntimeMinutes, 0);
  assert.equal(result.remainingMinutes, 0);
  assert.equal(result.remainingRatio, 0);
});

for (const [label, overrides] of [
  ["batteryRuntimeMinutes 누락", { batteryRuntimeMinutes: null }],
  ["safetyBufferMinutes 누락", { safetyBufferMinutes: undefined }],
  ["verifiedBackupRuntimeMinutes 음수", { verifiedBackupRuntimeMinutes: -1 }],
  ["batteryRuntimeMinutes 숫자 아님", { batteryRuntimeMinutes: "abc" }],
  ["outageStartedAt 잘못된 날짜", { outageStartedAt: "not-a-date" }],
  ["now 잘못된 날짜", { now: "not-a-date" }],
]) {
  test(`필수 안전시간 입력이 누락/오류이면(${label}) UNKNOWN이며 안전하다고 추정하지 않는다`, () => {
    const result = calculateSafetyTime({
      batteryRuntimeMinutes: 120,
      safetyBufferMinutes: 30,
      verifiedBackupRuntimeMinutes: 0,
      outageStartedAt: "2026-08-13T10:00:00.000Z",
      now: "2026-08-13T10:10:00.000Z",
      ...overrides,
    });
    assert.equal(result.status, SafetyTimeStatus.UNKNOWN);
    assert.equal(result.remainingMinutes, null);
    assert.equal(result.remainingRatio, null);

    const risk = evaluateRisk({ safetyTime: result });
    assert.equal(risk.level, RiskLevel.HIGH);
    assert.notEqual(risk.level, RiskLevel.WATCH);
  });
}

test("예고 정전의 예상 부족시간을 계산한다", () => {
  const result = calculatePlannedOutageShortfall({
    batteryRuntimeMinutes: 120,
    safetyBufferMinutes: 30,
    scheduledStartAt: "2026-08-13T10:00:00.000Z",
    scheduledEndAt: "2026-08-13T12:00:00.000Z",
  });

  assert.equal(result.expectedOutageMinutes, 120);
  assert.equal(result.effectiveRuntimeMinutes, 90);
  assert.equal(result.shortfallMinutes, 30);
});

// --- risk ------------------------------------------------------------------

test("위험도는 남은 비율 경계값 0.5에서 HIGH(WATCH 아님)로 판정한다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 50, remainingRatio: 0.5 };
  assert.equal(evaluateRisk({ safetyTime }).level, RiskLevel.HIGH);
});

test("남은 비율이 0.5보다 크면 WATCH다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 51, remainingRatio: 0.51 };
  assert.equal(evaluateRisk({ safetyTime }).level, RiskLevel.WATCH);
});

test("위험도는 남은 비율 경계값 0.2에서 CRITICAL로 판정한다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 20, remainingRatio: 0.2 };
  assert.equal(evaluateRisk({ safetyTime }).level, RiskLevel.CRITICAL);
});

test("남은 비율이 0.2보다 크고 0.5 이하이면 HIGH다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 21, remainingRatio: 0.21 };
  assert.equal(evaluateRisk({ safetyTime }).level, RiskLevel.HIGH);
});

test("effectiveRuntimeMinutes가 0이면 남은 시간도 0이라 즉시 CRITICAL이다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 0, remainingMinutes: 0, remainingRatio: 0 };
  const risk = evaluateRisk({ safetyTime });
  assert.equal(risk.level, RiskLevel.CRITICAL);
  assert.equal(risk.reason, "NO_REMAINING_SAFETY_TIME");
});

test("EQUIPMENT_ISSUE와 NEED_HELP 응답은 안전시간과 무관하게 CRITICAL이다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 90, remainingRatio: 0.9 };
  assert.equal(evaluateRisk({ safetyTime, response: PatientResponse.EQUIPMENT_ISSUE }).level, RiskLevel.CRITICAL);
  assert.equal(evaluateRisk({ safetyTime, response: PatientResponse.NEED_HELP }).level, RiskLevel.CRITICAL);
});

test("StatusCheck 타임아웃은 WATCH를 최소 HIGH로 올리지만 CRITICAL을 낮추지 않는다", () => {
  const watchTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 90, remainingRatio: 0.9 };
  assert.equal(evaluateRisk({ safetyTime: watchTime, statusCheckTimedOut: true }).level, RiskLevel.HIGH);

  const criticalTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 10, remainingRatio: 0.1 };
  assert.equal(evaluateRisk({ safetyTime: criticalTime, statusCheckTimedOut: true }).level, RiskLevel.CRITICAL);
});

test("모든 보호자가 대응 불가면 CRITICAL이다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 90, remainingRatio: 0.9 };
  assert.equal(evaluateRisk({ safetyTime, allGuardiansUnavailable: true }).level, RiskLevel.CRITICAL);
});

test("DEMO_ONLY 위험정책은 명시적으로 버전과 라벨을 갖는다", () => {
  assert.equal(DEMO_ONLY_RISK_POLICY.policyId, "DEMO_ONLY");
  assert.equal(typeof DEMO_ONLY_RISK_POLICY.version, "number");
  assert.equal(DEMO_ONLY_RISK_POLICY.responseTimeoutSeconds, 10);
});

test("위험 판정 결과는 판정에 사용된 정책의 policyId와 policyVersion을 포함한다", () => {
  const safetyTime = { status: SafetyTimeStatus.KNOWN, effectiveRuntimeMinutes: 100, remainingMinutes: 90, remainingRatio: 0.9 };
  const risk = evaluateRisk({ safetyTime });
  assert.equal(risk.policyId, DEMO_ONLY_RISK_POLICY.policyId);
  assert.equal(risk.policyVersion, DEMO_ONLY_RISK_POLICY.version);
});

// --- StatusCheck -------------------------------------------------------

test("StatusCheck는 응답 없이 기한이 지나면 TIMED_OUT이며 PatientResponse가 아니다", () => {
  const check = createStatusCheck({ impactCaseId: "case-1", purpose: "OUTAGE_STATUS", now: "2026-08-13T10:00:00.000Z", timeoutSeconds: 10 });
  assert.equal(check.status, StatusCheckStatus.PENDING);
  assert.equal(isStatusCheckDue(check, "2026-08-13T10:00:09.000Z"), false);
  assert.equal(isStatusCheckDue(check, "2026-08-13T10:00:10.000Z"), true);

  const timedOut = timeoutStatusCheck(check, "2026-08-13T10:00:10.000Z");
  assert.equal(timedOut.status, StatusCheckStatus.TIMED_OUT);
  assert.equal(timedOut.response, null);
  assert.ok(!Object.values(PatientResponse).includes(timedOut.status));
});

test("DEMO 10초 정책에서 5초 시점의 timeoutStatusCheck는 거부되며 TIMED_OUT으로 전이하지 않는다", () => {
  const check = createStatusCheck({ impactCaseId: "case-1", purpose: "OUTAGE_STATUS", now: "2026-08-13T10:00:00.000Z", timeoutSeconds: 10 });
  assert.throws(() => timeoutStatusCheck(check, "2026-08-13T10:00:05.000Z"), /STATUS_CHECK_NOT_DUE/);
  assert.equal(check.status, StatusCheckStatus.PENDING);
});

test("DEMO 10초 정책에서 정확히 10초 시점의 timeoutStatusCheck는 TIMED_OUT으로 전이한다", () => {
  const check = createStatusCheck({ impactCaseId: "case-1", purpose: "OUTAGE_STATUS", now: "2026-08-13T10:00:00.000Z", timeoutSeconds: 10 });
  const timedOut = timeoutStatusCheck(check, "2026-08-13T10:00:10.000Z");
  assert.equal(timedOut.status, StatusCheckStatus.TIMED_OUT);
});

test("응답을 받으면 StatusCheck는 RESPONDED로 전이하고 이미 처리된 건은 다시 응답할 수 없다", () => {
  const check = createStatusCheck({ impactCaseId: "case-1", purpose: "OUTAGE_STATUS", now: "2026-08-13T10:00:00.000Z", timeoutSeconds: 10 });
  const responded = respondToStatusCheck(check, PatientResponse.NORMAL, "2026-08-13T10:00:05.000Z");
  assert.equal(responded.status, StatusCheckStatus.RESPONDED);
  assert.throws(() => respondToStatusCheck(responded, PatientResponse.NORMAL), /STATUS_CHECK_NOT_PENDING/);

  const cancelled = cancelStatusCheck(check, "2026-08-13T10:00:01.000Z");
  assert.equal(cancelled.status, StatusCheckStatus.CANCELLED);
});

// --- escalation --------------------------------------------------------

test("에스컬레이션은 라운드마다 보호자 한 명만 선택하고 모두 소진되면 기관으로 넘긴다", () => {
  const contacts = [
    { id: "g1", phone: "010-1", contactOrder: 1 },
    { id: "g2", phone: "010-2", contactOrder: 2 },
  ];
  const round0 = selectEscalationTarget({ contacts, escalationRound: 0 });
  assert.equal(round0.recipientType, "GUARDIAN");
  assert.equal(round0.contact.id, "g1");
  assert.equal(round0.exhausted, false);

  const round1 = selectEscalationTarget({ contacts, escalationRound: round0.nextEscalationRound });
  assert.equal(round1.contact.id, "g2");

  const round2 = selectEscalationTarget({ contacts, escalationRound: round1.nextEscalationRound });
  assert.equal(round2.recipientType, "INSTITUTION");
  assert.equal(round2.contact, null);
  assert.equal(round2.exhausted, true);
});

// --- matching ------------------------------------------------------------

test("지역코드를 우선 사용하고 같은 정전-환자 대응 건의 중복 생성을 막는다", () => {
  const outage = {
    id: "outage-1",
    mode: Mode.TEST,
    status: OutageStatus.ACTIVE,
    regionCode: "11260",
    startedAt: "2026-08-13T10:00:00.000Z",
  };
  const patients = [
    { id: "patient-1", regionCode: "11260", powerProfile: { batteryRuntimeMinutes: 180, safetyBufferMinutes: 30 } },
    { id: "patient-2", regionCode: "11290", powerProfile: { batteryRuntimeMinutes: 180, safetyBufferMinutes: 30 } },
  ];

  assert.deepEqual(matchPatientToOutage(patients[0], outage), { matched: true, source: "REGION_CODE" });
  const first = createImpactCases({ outage, patients, now: "2026-08-13T10:00:00.000Z", idFactory: () => "case-1" });
  assert.equal(first.created.length, 1);
  assert.equal(first.created[0].status, ImpactCaseStatus.WAITING_PATIENT);

  const second = createImpactCases({ outage, patients, existingCases: first.created, now: "2026-08-13T10:00:00.000Z" });
  assert.equal(second.created.length, 0);
  assert.deepEqual(second.skipped, [{ patientId: "patient-1", reason: "DUPLICATE_OUTAGE_PATIENT" }]);
});

test("생성된 ImpactCase 스냅샷은 판정에 쓰인 policyId와 policyVersion을 포함한다", () => {
  const outage = {
    id: "outage-3",
    mode: Mode.TEST,
    status: OutageStatus.ACTIVE,
    regionCode: "11260",
    startedAt: "2026-08-13T10:00:00.000Z",
  };
  const patients = [{ id: "patient-1", regionCode: "11260", powerProfile: { batteryRuntimeMinutes: 180, safetyBufferMinutes: 30 } }];
  const { created } = createImpactCases({ outage, patients, now: "2026-08-13T10:00:00.000Z", riskPolicy: DEMO_ONLY_RISK_POLICY });
  assert.equal(created[0].policyId, DEMO_ONLY_RISK_POLICY.policyId);
  assert.equal(created[0].policyVersion, DEMO_ONLY_RISK_POLICY.version);
});

test("예고 정전(SCHEDULED)은 아직 위험을 매기지 않고 PREPARE 상태로 생성된다", () => {
  const outage = { id: "outage-2", mode: Mode.TEST, status: OutageStatus.SCHEDULED, regionCode: "11260", scheduledStartAt: "2026-08-14T00:00:00.000Z" };
  const patients = [{ id: "patient-1", regionCode: "11260", powerProfile: { batteryRuntimeMinutes: 180, safetyBufferMinutes: 30 } }];
  const { created } = createImpactCases({ outage, patients, now: "2026-08-13T10:00:00.000Z" });
  assert.equal(created[0].status, ImpactCaseStatus.PREPARE);
  assert.equal(created[0].riskLevel, null);
});

// --- case closing ----------------------------------------------------------

test("복구 확인은 가구 전력과 장비가 모두 정상이어야 종료를 허용한다", () => {
  assert.equal(canCloseImpactCase({ recoveryConfirmation: { householdPowerNormal: true, deviceNormal: true } }), true);
  assert.equal(canCloseImpactCase({ recoveryConfirmation: { householdPowerNormal: true, deviceNormal: false } }), false);
  assert.equal(canCloseImpactCase({ recoveryConfirmation: null }), false);
});

test("정전 이벤트는 모든 환자 대응 건이 CLOSED여야 종료를 허용한다", () => {
  assert.equal(canCloseOutage({ caseSnapshots: [{ status: ImpactCaseStatus.CLOSED }, { status: ImpactCaseStatus.CLOSED }] }), true);
  assert.equal(canCloseOutage({ caseSnapshots: [{ status: ImpactCaseStatus.CLOSED }, { status: ImpactCaseStatus.RECOVERY_CHECK }] }), false);
  assert.equal(canCloseOutage({ caseSnapshots: [] }), false);
});
