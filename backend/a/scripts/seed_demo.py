"""로컬 TEST 용도의 환자·보호자 샘플 데이터를 생성한다."""
from sqlalchemy import select

from app.database import SessionLocal
from app.models import EmergencyContact, Guardian, GuardianPatient, MedicalDevice, Patient, PowerProfile
from app.security import hash_password


def main() -> None:
    with SessionLocal() as db:
        if db.scalar(select(Guardian.id).where(Guardian.phone == "01000000001")):
            print("demo data already exists")
            return
        guardian = Guardian(name="데모보호자", phone="01000000001", password_hash=hash_password("demo-password"))
        patient = Patient(
            name="데모환자",
            phone="01000000002",
            affiliated_institution="데모복지관",
            address="서울특별시 중구 세종대로 1",
            region_code="11140",
            diagnosis="DEMO_ONLY 호흡기 질환",
            electronic_devices=["가정용 인공호흡기"],
        )
        db.add_all([guardian, patient])
        db.flush()
        db.add(GuardianPatient(guardian_id=guardian.id, patient_id=patient.id, priority=1))
        patient.power_profile = PowerProfile(
            safety_margin_minutes=30,
            backup_power_runtime_minutes=60,
            backup_power_verified=True,
            devices=[
                MedicalDevice(
                    device_type="가정용 인공호흡기",
                    model_name="DEMO-VENT-1",
                    battery_runtime_minutes=180,
                    runtime_verified=True,
                )
            ],
        )
        patient.emergency_contacts = [
            EmergencyContact(
                guardian_id=guardian.id,
                name=guardian.name,
                phone=guardian.phone,
                relationship="자녀",
                priority=1,
            )
        ]
        db.commit()
        print(f"created demo guardian={guardian.id} patient={patient.id}")


if __name__ == "__main__":
    main()
