function asCode(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_:-]{0,63}$/.test(value) ? value : null;
}

function asCodeArray(value) {
  return Array.isArray(value) ? value.map(asCode).filter(Boolean) : [];
}

function asRegionCode(value) {
  return typeof value === "string" && /^\d{2,12}$/.test(value) ? value : null;
}

function asIsoDate(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildPatientFacts(patient = {}, impactCase = {}) {
  const context = patient.notificationContext ?? {};
  const profile = patient.powerProfile ?? {};
  return {
    medicalDeviceTypes: asCodeArray(context.medicalDeviceTypes),
    powerDependencyLevel: asCode(context.powerDependencyLevel),
    mobilitySupportRequired: typeof context.mobilitySupportRequired === "boolean" ? context.mobilitySupportRequired : null,
    communicationSupport: asCode(context.communicationSupport),
    approvedPrecautionCodes: asCodeArray(context.approvedPrecautionCodes),
    responsePlanActionCodes: asCodeArray(impactCase.responsePlanActionCodes),
    batteryRuntimeMinutes: Number.isFinite(profile.batteryRuntimeMinutes) ? profile.batteryRuntimeMinutes : null,
    verifiedBackupRuntimeMinutes: Number.isFinite(profile.verifiedBackupRuntimeMinutes)
      ? profile.verifiedBackupRuntimeMinutes
      : null,
    safetyBufferMinutes: Number.isFinite(profile.safetyBufferMinutes) ? profile.safetyBufferMinutes : null,
    remainingSafetyMinutes: Number.isFinite(impactCase.safetyTime?.remainingMinutes)
      ? impactCase.safetyTime.remainingMinutes
      : null,
    riskLevel: asCode(impactCase.riskLevel),
    riskReason: asCode(impactCase.riskReason),
    patientResponse: asCode(impactCase.response),
  };
}

export function buildDisasterFacts(outage = {}) {
  return {
    disasterType: asCode(outage.disasterType) ?? "POWER_OUTAGE",
    status: asCode(outage.status),
    severity: asCode(outage.severity),
    regionCode: asRegionCode(outage.regionCode),
    startedAt: asIsoDate(outage.startedAt),
    scheduledStartAt: asIsoDate(outage.scheduledStartAt),
    scheduledEndAt: asIsoDate(outage.scheduledEndAt),
    expectedEndAt: asIsoDate(outage.expectedEndAt),
    officialGuidanceCodes: asCodeArray(outage.officialGuidanceCodes),
  };
}
