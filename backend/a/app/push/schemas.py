from pydantic import BaseModel, Field

from ..models import PushNotificationType, PushPlatform, UserRole


class PushDeviceRegisterRequest(BaseModel):
    token: str = Field(min_length=10, max_length=500)
    platform: PushPlatform


class PushNotificationSendRequest(BaseModel):
    notification_type: PushNotificationType = PushNotificationType.DISASTER_ALERT
    recipient_id: str = Field(min_length=36, max_length=36)
    recipient_role: UserRole
    escalation_round: int = Field(default=0, ge=0, le=100)
