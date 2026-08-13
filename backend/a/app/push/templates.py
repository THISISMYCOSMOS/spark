from ..models import DisasterType


DISASTER_PUSH_TEMPLATES: dict[DisasterType, tuple[str, str]] = {
    DisasterType.TYPHOON: (
        "태풍 재난 알림",
        "태풍 영향이 지속 중입니다. 외출을 자제하고 창문과 주변 시설물을 확인해 주세요.",
    ),
    DisasterType.EARTHQUAKE: (
        "지진 재난 알림",
        "지진이 발생했습니다. 낙하물을 피해 안전한 곳으로 이동하고 여진에 대비해 주세요.",
    ),
    DisasterType.COLD_WAVE: (
        "한파 재난 알림",
        "한파가 지속 중입니다. 외출을 줄이고 보온과 난방기기 안전을 확인해 주세요.",
    ),
    DisasterType.FIRE: (
        "화재 재난 알림",
        "화재가 발생했습니다. 연기를 피해 신속히 대피하고 엘리베이터를 사용하지 마세요.",
    ),
}
