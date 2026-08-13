from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from ..models import UserRole
from ..security import normalize_phone


class GuardianSignupRequest(BaseModel):
    guardian_name: str = Field(min_length=1, max_length=100)
    guardian_phone: str
    password: str = Field(min_length=8, max_length=128)
    patient_name: str = Field(min_length=1, max_length=100)
    patient_phone: str
    secondary_phone: str | None = None
    affiliated_institution: str | None = Field(default=None, max_length=200)
    patient_address: str = Field(min_length=1, max_length=500)
    diagnosis: str = Field(min_length=1, max_length=500)
    electronic_devices: list[str] = Field(min_length=1, max_length=30)

    @field_validator("guardian_phone", "patient_phone", "secondary_phone")
    @classmethod
    def validate_phone(cls, value: str | None):
        return normalize_phone(value) if value else value

    @field_validator("electronic_devices")
    @classmethod
    def validate_devices(cls, values: list[str]):
        cleaned = [value.strip() for value in values if value.strip()]
        if not cleaned or any(len(value) > 100 for value in cleaned):
            raise ValueError("전자기기 이름을 1개 이상 올바르게 입력해야 합니다.")
        return list(dict.fromkeys(cleaned))


class GuardianLoginRequest(BaseModel):
    phone: str
    password: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str):
        return normalize_phone(value)


class PatientLoginRequest(BaseModel):
    guardian_code: str = Field(min_length=8, max_length=30)


class PatientView(BaseModel):
    id: str
    name: str
    phone: str
    secondary_phone: str | None
    affiliated_institution: str | None
    address: str
    diagnosis: str
    electronic_devices: list[str]

    model_config = {"from_attributes": True}


class GuardianView(BaseModel):
    id: str
    name: str
    phone: str

    model_config = {"from_attributes": True}


class TokenView(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int


class AuthView(BaseModel):
    role: UserRole
    token: TokenView
    guardian: GuardianView | None = None
    patient: PatientView | None = None
    patients: list[PatientView] = Field(default_factory=list)
    guardian_code: str | None = None


class Meta(BaseModel):
    timestamp: datetime


class SuccessResponse(BaseModel):
    data: AuthView
    meta: Meta
    error: None = None
