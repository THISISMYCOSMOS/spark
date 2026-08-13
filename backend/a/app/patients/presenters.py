from ..models import Patient


def patient_detail(patient: Patient) -> dict:
    profile = patient.power_profile
    return {
        "id": patient.id,
        "name": patient.name,
        "phone": patient.phone,
        "secondaryPhone": patient.secondary_phone,
        "affiliatedInstitution": patient.affiliated_institution,
        "address": patient.address,
        "addressDetail": patient.address_detail,
        "regionCode": patient.region_code,
        "diagnosis": patient.diagnosis,
        "isActive": patient.is_active,
        "version": patient.version,
        "powerProfile": None if profile is None else {
            "id": profile.id,
            "safetyMarginMinutes": profile.safety_margin_minutes,
            "backupPowerRuntimeMinutes": profile.backup_power_runtime_minutes,
            "backupPowerVerified": profile.backup_power_verified,
            "version": profile.version,
            "devices": [
                {
                    "id": device.id,
                    "deviceType": device.device_type,
                    "modelName": device.model_name,
                    "batteryRuntimeMinutes": device.battery_runtime_minutes,
                    "runtimeVerified": device.runtime_verified,
                    "isEssential": device.is_essential,
                }
                for device in profile.devices
            ],
        },
        "emergencyContacts": [
            {
                "id": contact.id,
                "guardianId": contact.guardian_id,
                "name": contact.name,
                "phone": contact.phone,
                "relationship": contact.relationship,
                "priority": contact.priority,
                "isActive": contact.is_active,
            }
            for contact in sorted(patient.emergency_contacts, key=lambda item: item.priority)
        ],
        "createdAt": patient.created_at.isoformat(),
        "updatedAt": patient.updated_at.isoformat(),
    }


def patient_audit_snapshot(patient: Patient) -> dict:
    detail = patient_detail(patient)
    detail.pop("createdAt", None)
    detail.pop("updatedAt", None)
    return detail
