from ..models import Guardian, Patient, UserRole
from ..security import create_access_token


def patient_view(patient: Patient) -> dict:
    return {
        "id": patient.id,
        "name": patient.name,
        "phone": patient.phone,
        "secondaryPhone": patient.secondary_phone,
        "affiliatedInstitution": patient.affiliated_institution,
        "address": patient.address,
        "diagnosis": patient.diagnosis,
        "electronicDevices": patient.electronic_devices,
    }


def guardian_view(guardian: Guardian) -> dict:
    return {"id": guardian.id, "name": guardian.name, "phone": guardian.phone}


def token_view(subject_id: str, role: UserRole) -> dict:
    token, expires_in = create_access_token(subject_id, role)
    return {"accessToken": token, "tokenType": "Bearer", "expiresIn": expires_in}
