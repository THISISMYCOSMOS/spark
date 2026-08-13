function verifiedEssentialRuntime(profile = {}) {
  const essential = (profile.devices ?? []).filter((device) => device.isEssential !== false);
  if (essential.length === 0 || essential.some((device) => !device.runtimeVerified || !Number.isFinite(device.batteryRuntimeMinutes))) {
    return null;
  }
  return Math.min(...essential.map((device) => device.batteryRuntimeMinutes));
}
export function mapBackendAPatient(patient, notificationContext) {
  if (!patient?.id || !patient?.phone || !patient?.regionCode) throw new TypeError("Backend A patient snapshot is incomplete");
  const profile = patient.powerProfile ?? {};
  return {
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    regionCode: patient.regionCode,
    notificationContext,
    powerProfile: {
      batteryRuntimeMinutes: verifiedEssentialRuntime(profile),
      verifiedBackupRuntimeMinutes:
        profile.backupPowerVerified && Number.isFinite(profile.backupPowerRuntimeMinutes)
          ? profile.backupPowerRuntimeMinutes
          : 0,
      safetyBufferMinutes: Number.isFinite(profile.safetyMarginMinutes) ? profile.safetyMarginMinutes : null,
    },
    emergencyContacts: (patient.emergencyContacts ?? [])
      .filter((contact) => contact.isActive !== false)
      .map((contact) => ({ id: contact.id, guardianId: contact.guardianId, name: contact.name, phone: contact.phone, priority: contact.priority })),
    institutionContacts: [],
  };
}

export function mapBackendAOutage(outage, document) {
  return {
    id: outage.id,
    mode: outage.mode,
    status: outage.status,
    disasterType: document.disasterType,
    severity: document.severity,
    regionCode: document.regionCode,
    regionCodes: outage.regionCodes ?? [document.regionCode],
    startedAt: outage.startedAt,
    expectedEndAt: outage.expectedEndAt,
    officialGuidanceCodes: document.officialGuidanceCodes,
  };
}
