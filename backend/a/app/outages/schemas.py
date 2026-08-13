from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models import ImpactCaseStatus, OperationMode, OutageType, RiskLevel


def ensure_aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise ValueError("시간에는 UTC 오프셋이 포함되어야 합니다.")
    return value


class OutageCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    outage_type: OutageType
    mode: OperationMode
    region_codes: list[str] = Field(min_length=1, max_length=1000)
    scheduled_start_at: datetime | None = None
    expected_end_at: datetime | None = None
    started_at: datetime | None = None
    source: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("scheduled_start_at", "expected_end_at", "started_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)

    @field_validator("region_codes")
    @classmethod
    def regions(cls, values: list[str]):
        cleaned = [value.strip().upper() for value in values if value.strip()]
        if not cleaned or any(len(value) > 20 for value in cleaned):
            raise ValueError("지역 코드를 올바르게 입력해야 합니다.")
        return list(dict.fromkeys(cleaned))

    @model_validator(mode="after")
    def type_times(self):
        if self.outage_type == OutageType.SCHEDULED and self.scheduled_start_at is None:
            raise ValueError("예고 정전은 예정 시작 시각이 필요합니다.")
        if self.outage_type == OutageType.UNPLANNED and self.scheduled_start_at is not None:
            raise ValueError("비예고 정전에는 예정 시작 시각을 입력할 수 없습니다.")
        return self


class OutageUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    region_codes: list[str] = Field(min_length=1, max_length=1000)
    scheduled_start_at: datetime
    expected_end_at: datetime | None = None
    source: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("scheduled_start_at", "expected_end_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)

    @field_validator("region_codes")
    @classmethod
    def regions(cls, values: list[str]):
        return OutageCreateRequest.regions(values)


class StateChangeRequest(BaseModel):
    version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=500)
    occurred_at: datetime | None = None

    @field_validator("occurred_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)


class ImpactCaseCreateRequest(BaseModel):
    patient_id: str = Field(min_length=36, max_length=36)
    status: ImpactCaseStatus
    risk_level: RiskLevel
    risk_policy_id: str = Field(min_length=36, max_length=36)
    risk_policy_version: int = Field(ge=1)
    effective_runtime_minutes: int | None = Field(default=None, ge=0, le=525_600)
    runtime_unknown_reason: str | None = Field(default=None, max_length=500)
    response_due_at: datetime | None = None
    risk_calculated_at: datetime
    risk_reason: str = Field(min_length=1, max_length=1000)

    @field_validator("response_due_at", "risk_calculated_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)

    @model_validator(mode="after")
    def runtime_consistency(self):
        if self.effective_runtime_minutes is None and not self.runtime_unknown_reason:
            raise ValueError("자립시간 UNKNOWN 사유가 필요합니다.")
        if self.effective_runtime_minutes is not None and self.runtime_unknown_reason:
            raise ValueError("자립시간 값과 UNKNOWN 사유를 동시에 입력할 수 없습니다.")
        if self.effective_runtime_minutes is None and self.risk_level == RiskLevel.WATCH:
            raise ValueError("자립시간 UNKNOWN의 위험도는 최소 HIGH여야 합니다.")
        if self.effective_runtime_minutes == 0 and self.risk_level != RiskLevel.CRITICAL:
            raise ValueError("유효 자립시간이 0이면 위험도는 CRITICAL이어야 합니다.")
        return self


class ImpactCaseTransitionRequest(BaseModel):
    next_status: ImpactCaseStatus
    version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=500)


class RiskResultRequest(BaseModel):
    risk_level: RiskLevel
    effective_runtime_minutes: int | None = Field(default=None, ge=0, le=525_600)
    runtime_unknown_reason: str | None = Field(default=None, max_length=500)
    response_due_at: datetime | None = None
    risk_calculated_at: datetime
    risk_reason: str = Field(min_length=1, max_length=1000)
    version: int = Field(ge=1)

    @field_validator("response_due_at", "risk_calculated_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)

    @model_validator(mode="after")
    def runtime_consistency(self):
        if self.effective_runtime_minutes is None and not self.runtime_unknown_reason:
            raise ValueError("자립시간 UNKNOWN 사유가 필요합니다.")
        if self.effective_runtime_minutes is not None and self.runtime_unknown_reason:
            raise ValueError("자립시간 값과 UNKNOWN 사유를 동시에 입력할 수 없습니다.")
        if self.effective_runtime_minutes is None and self.risk_level == RiskLevel.WATCH:
            raise ValueError("자립시간 UNKNOWN의 위험도는 최소 HIGH여야 합니다.")
        if self.effective_runtime_minutes == 0 and self.risk_level != RiskLevel.CRITICAL:
            raise ValueError("유효 자립시간이 0이면 위험도는 CRITICAL이어야 합니다.")
        return self
