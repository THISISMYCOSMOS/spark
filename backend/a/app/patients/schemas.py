from pydantic import BaseModel, Field, field_validator, model_validator

from ..security import normalize_phone


class MedicalDeviceInput(BaseModel):
    device_type: str = Field(min_length=1, max_length=100)
    model_name: str | None = Field(default=None, max_length=100)
    battery_runtime_minutes: int | None = Field(default=None, ge=0, le=525_600)
    runtime_verified: bool = False
    is_essential: bool = True

    @model_validator(mode="after")
    def verified_runtime_required(self):
        if self.runtime_verified and self.battery_runtime_minutes is None:
            raise ValueError("검증된 기기는 배터리 지속시간이 필요합니다.")
        return self


class PowerProfileInput(BaseModel):
    safety_margin_minutes: int = Field(default=0, ge=0, le=10_080)
    backup_power_runtime_minutes: int | None = Field(default=None, ge=0, le=525_600)
    backup_power_verified: bool = False
    devices: list[MedicalDeviceInput] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def verified_backup_runtime_required(self):
        if self.backup_power_verified and self.backup_power_runtime_minutes is None:
            raise ValueError("검증된 보조전원은 지속시간이 필요합니다.")
        return self


class EmergencyContactInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str
    relationship: str | None = Field(default=None, max_length=100)
    priority: int = Field(ge=1, le=100)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str):
        return normalize_phone(value)


class PatientWriteRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str
    secondary_phone: str | None = None
    affiliated_institution: str | None = Field(default=None, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    address_detail: str | None = Field(default=None, max_length=200)
    region_code: str = Field(pattern=r"^[A-Za-z0-9_-]{2,20}$")
    diagnosis: str = Field(min_length=1, max_length=500)
    power_profile: PowerProfileInput
    emergency_contacts: list[EmergencyContactInput] = Field(min_length=1, max_length=20)

    @field_validator("phone", "secondary_phone")
    @classmethod
    def validate_phone(cls, value: str | None):
        return normalize_phone(value) if value else value

    @model_validator(mode="after")
    def unique_contacts(self):
        priorities = [contact.priority for contact in self.emergency_contacts]
        phones = [contact.phone for contact in self.emergency_contacts]
        if len(priorities) != len(set(priorities)):
            raise ValueError("보호자 연락 순서는 중복될 수 없습니다.")
        if len(phones) != len(set(phones)):
            raise ValueError("보호자 전화번호는 중복될 수 없습니다.")
        return self


class PatientCreateRequest(PatientWriteRequest):
    change_reason: str = Field(default="환자 등록", min_length=1, max_length=500)


class PatientUpdateRequest(PatientWriteRequest):
    version: int = Field(ge=1)
    change_reason: str = Field(min_length=1, max_length=500)
