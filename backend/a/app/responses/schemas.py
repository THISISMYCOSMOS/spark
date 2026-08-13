from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models import GuardianActionStatus, PatientResponseType, StatusCheckPurpose
from ..outages.schemas import canonical_uuid, ensure_aware


class StatusCheckRegisterRequest(BaseModel):
    id: str = Field(min_length=36, max_length=36)
    purpose: StatusCheckPurpose
    token: str = Field(min_length=24, max_length=500)
    requested_at: datetime
    provider_accepted_at: datetime
    response_due_at: datetime
    token_expires_at: datetime

    @field_validator("requested_at", "provider_accepted_at", "response_due_at", "token_expires_at")
    @classmethod
    def aware_time(cls, value): return ensure_aware(value)

    @field_validator("id", mode="before")
    @classmethod
    def valid_id(cls, value): return canonical_uuid(value)

    @field_validator("purpose", mode="before")
    @classmethod
    def legacy_purpose(cls, value):
        aliases = {
            "OUTAGE_CHECK": StatusCheckPurpose.OUTAGE_STATUS,
            "RECOVERY_CHECK": StatusCheckPurpose.RECOVERY_CONFIRMATION,
        }
        return aliases.get(value, value)

    @model_validator(mode="after")
    def chronology(self):
        if self.provider_accepted_at != self.requested_at:
            raise ValueError("requested_at은 provider_accepted_at과 같아야 합니다.")
        if self.response_due_at <= self.provider_accepted_at:
            raise ValueError("응답 제한 시각은 공급자 접수 이후여야 합니다.")
        if self.token_expires_at != self.response_due_at:
            raise ValueError("token_expires_at은 response_due_at과 같아야 합니다.")
        return self


class TimeoutRequest(BaseModel):
    version: int = Field(ge=1)
    timed_out_at: datetime
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("timed_out_at")
    @classmethod
    def aware_time(cls, value): return ensure_aware(value)


class PublicCheckInResponse(BaseModel):
    response_type: PatientResponseType | None = None
    home_power_restored: bool | None = None
    device_operating_normally: bool | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("response_type", mode="before")
    @classmethod
    def legacy_response_type(cls, value):
        return PatientResponseType.NORMAL if value == "OK" else value


class GuardianActionRequest(BaseModel):
    emergency_contact_id: str = Field(min_length=36, max_length=36)
    status: GuardianActionStatus
    escalation_round: int = Field(ge=1, le=100)
    note: str | None = Field(default=None, max_length=500)
    acted_at: datetime

    @field_validator("acted_at")
    @classmethod
    def aware_time(cls, value): return ensure_aware(value)


class RecoveryConfirmationRequest(BaseModel):
    home_power_restored: bool
    device_operating_normally: bool
    reason: str = Field(min_length=1, max_length=500)


class RegionalRecoveryRequest(BaseModel):
    version: int = Field(ge=1)
    recovered_at: datetime
    source: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("recovered_at")
    @classmethod
    def aware_time(cls, value): return ensure_aware(value)
