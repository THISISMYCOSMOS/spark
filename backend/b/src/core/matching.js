import { randomUUID } from "node:crypto";
import { ImpactCaseStatus, OutageStatus } from "../contracts.js";
import { calculateSafetyTime } from "./safety-time.js";
import { DEMO_ONLY_RISK_POLICY, evaluateRisk } from "./risk.js";

function digits(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizeAddress(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/[(),.-]/g, "")
    : "";
}

export function matchPatientToOutage(patient, outage) {
  const patientRegion = digits(patient.regionCode ?? patient.address?.regionCode);
  const outageRegions = (outage.regionCodes ?? [outage.regionCode]).map(digits).filter(Boolean);
  if (patientRegion && outageRegions.length > 0) {
    return {
      matched: outageRegions.includes(patientRegion),
      source: "REGION_CODE",
    };
  }

  const patientAddress = normalizeAddress(patient.addressText ?? patient.address?.text);
  const scopes = (outage.addressScopes ?? [outage.addressScope]).map(normalizeAddress).filter(Boolean);
  if (patientAddress && scopes.length > 0) {
    return {
      matched: scopes.some((scope) => patientAddress.startsWith(scope)),
      source: "ADDRESS_PREFIX",
    };
  }

  return { matched: false, source: "INSUFFICIENT_LOCATION_DATA" };
}

export function selectAffectedPatients(patients, outage) {
  return patients
    .map((patient) => ({ patient, match: matchPatientToOutage(patient, outage) }))
    .filter(({ match }) => match.matched);
}

export function createImpactCases({
  outage,
  patients,
  existingCases = [],
  now = new Date(),
  riskPolicy,
  idFactory = randomUUID,
}) {
  const existingKeys = new Set(existingCases.map((item) => `${item.outageId}:${item.patientId}`));
  const created = [];
  const skipped = [];

  for (const { patient, match } of selectAffectedPatients(patients, outage)) {
    const key = `${outage.id}:${patient.id}`;
    if (existingKeys.has(key)) {
      skipped.push({ patientId: patient.id, reason: "DUPLICATE_OUTAGE_PATIENT" });
      continue;
    }

    const profile = patient.powerProfile ?? {};
    const isScheduled = outage.status === OutageStatus.SCHEDULED;
    const policy = riskPolicy ?? DEMO_ONLY_RISK_POLICY;

    // Risk is graded once the outage has actually started. A SCHEDULED (not yet
    // started) outage has no risk yet — workflow and risk stay independent (v0.1 #1).
    let safetyTime = null;
    let risk = { level: null, reason: "OUTAGE_NOT_STARTED", policyId: policy.policyId, policyVersion: policy.version };
    if (!isScheduled) {
      safetyTime = calculateSafetyTime({
        batteryRuntimeMinutes: profile.batteryRuntimeMinutes,
        safetyBufferMinutes: profile.safetyBufferMinutes,
        verifiedBackupRuntimeMinutes: profile.verifiedBackupRuntimeMinutes ?? 0,
        outageStartedAt: outage.startedAt ?? outage.scheduledStartAt,
        now,
      });
      risk = evaluateRisk({ safetyTime, response: null, policy });
    }

    const impactCase = {
      id: idFactory(),
      outageId: outage.id,
      patientId: patient.id,
      mode: outage.mode,
      status: isScheduled ? ImpactCaseStatus.PREPARE : ImpactCaseStatus.WAITING_PATIENT,
      riskLevel: risk.level,
      riskReason: risk.reason,
      policyId: risk.policyId,
      policyVersion: risk.policyVersion,
      safetyTime,
      response: null,
      escalationRound: 0,
      recoveryEscalationRound: 0,
      matchSource: match.source,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    created.push(impactCase);
    existingKeys.add(key);
  }

  return { created, skipped };
}
