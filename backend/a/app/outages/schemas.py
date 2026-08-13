from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models import DisasterType, ImpactCaseStatus, OperationMode, OutageType, RiskLevel


def ensure_aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise ValueError("시간에는 UTC 오프셋이 포함되어야 합니다.")
    return value


def canonical_uuid(value) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("canonical UUID 형식이어야 합니다.") from exc


class OutageCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    outage_type: OutageType
    disaster_type: DisasterType = DisasterType.POWER_OUTAGE
    severity: str | None = Field(default=None, pattern=r"^(ADVISORY|WATCH|WARNING|SEVERE)$")
    official_guidance_codes: list[str] = Field(default_factory=list, max_length=30)
    source_document_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
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

    @field_validator("official_guidance_codes")
    @classmethod
    def guidance_codes(cls, values: list[str]):
        if any(not value or len(value) > 64 or not value.replace("_", "").isalnum() for value in values):
            raise ValueError("공식 행동 코드 형식이 올바르지 않습니다.")
        return list(dict.fromkeys(values))

    @model_validator(mode="after")
    def type_times(self):
        if self.outage_type == OutageType.SCHEDULED and self.scheduled_start_at is None:
            raise ValueError("예고 정전은 예정 시작 시각이 필요합니다.")
        if self.outage_type == OutageType.UNPLANNED and self.scheduled_start_at is not None:
            raise ValueError("비예고 정전에는 예정 시작 시각을 입력할 수 없습니다.")
        return self


class CoreDisasterCreateRequest(OutageCreateRequest):
    @model_validator(mode="after")
    def mock_disaster_only(self):
        if self.mode != OperationMode.TEST:
            raise ValueError("목업 PDF 재난은 TEST 모드만 허용됩니다.")
        if self.outage_type != OutageType.UNPLANNED:
            raise ValueError("목업 PDF 재난은 비예고 사건이어야 합니다.")
        if self.disaster_type == DisasterType.POWER_OUTAGE:
            raise ValueError("목업 PDF에는 구체적인 재난 유형이 필요합니다.")
        if self.source_document_sha256 is None:
            raise ValueError("목업 PDF SHA-256이 필요합니다.")
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
    id: str = Field(min_length=36, max_length=36)
    patient_id: str = Field(min_length=36, max_length=36)
    status: ImpactCaseStatus
    risk_level: RiskLevel | None = None
    risk_policy_id: str = Field(min_length=36, max_length=36)
    risk_policy_version: int = Field(ge=1)
    effective_runtime_minutes: float | None = Field(default=None, ge=0, le=525_600)
    runtime_unknown_reason: str | None = Field(default=None, max_length=500)
    response_due_at: datetime | None = None
    risk_calculated_at: datetime
    risk_reason: str = Field(min_length=1, max_length=1000)

    @field_validator("response_due_at", "risk_calculated_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)

    @field_validator("id", mode="before")
    @classmethod
    def valid_id(cls, value):
        return canonical_uuid(value)

class ImpactCaseTransitionRequest(BaseModel):
    next_status: ImpactCaseStatus
    version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=500)


class RiskResultRequest(BaseModel):
    policy_id: str = Field(min_length=36, max_length=36)
    policy_version: int = Field(ge=1)
    risk_level: RiskLevel
    effective_runtime_minutes: float | None = Field(default=None, ge=0, le=525_600)
    runtime_unknown_reason: str | None = Field(default=None, max_length=500)
    response_due_at: datetime | None = None
    risk_calculated_at: datetime
    risk_reason: str = Field(min_length=1, max_length=1000)
    version: int = Field(ge=1)

    @model_validator(mode="before")
    @classmethod
    def canonical_policy_fields(cls, value):
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        if "policy_id" not in normalized and "policyId" in normalized:
            normalized["policy_id"] = normalized["policyId"]
        if "policy_version" not in normalized and "policyVersion" in normalized:
            normalized["policy_version"] = normalized["policyVersion"]
        return normalized

    @field_validator("response_due_at", "risk_calculated_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)

    @field_validator("policy_id", mode="before")
    @classmethod
    def valid_policy_id(cls, value):
        return canonical_uuid(value)

class OutageCloseRequest(BaseModel):
    version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=500)
    occurred_at: datetime | None = None

    @field_validator("occurred_at")
    @classmethod
    def aware_time(cls, value):
        return ensure_aware(value)
