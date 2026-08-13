export const RESPONSE_PLAN_POLICY_VERSION = "DISASTER_RESPONSE_PLAN_V1";

export const RESPONSE_ACTIONS = Object.freeze({
  FOLLOW_OFFICIAL_ALERTS: "공식 재난 알림과 대피 명령을 계속 확인합니다.",
  FOLLOW_DEVICE_MANUFACTURER_INSTRUCTIONS: "의료기기는 등록된 제조사 사용 지침과 의료진의 기존 계획에 따라 사용합니다.",
  CHECK_DEVICE_POWER: "의료기기의 현재 전원 연결과 배터리 잔량을 확인합니다.",
  CHECK_BACKUP_POWER: "등록된 보조전원의 사용 가능 여부와 예상 사용 시간을 확인합니다.",
  CONTACT_CARE_TEAM_ON_DEVICE_ALARM: "기기 경보나 이상이 있으면 등록된 의료기관 또는 담당자에게 연락합니다.",
  CONTACT_REGISTERED_GUARDIAN: "도움이 필요하면 등록된 보호자에게 연락합니다.",
  CONFIRM_EVACUATION_ASSISTANCE: "이동 지원이 필요한 경우 등록된 보호자와 대피 지원 가능 여부를 확인합니다.",
  KEEP_TEXT_CONTACT_AVAILABLE: "문자 수신과 회신이 가능하도록 휴대전화 전원을 확보합니다.",
  KEEP_DEVICE_DRY: "의료기기와 전원 장치를 침수와 빗물로부터 보호합니다.",
  NEVER_USE_GENERATOR_INDOORS: "발전기는 실내나 밀폐 공간에서 사용하지 않습니다.",
  DROP_COVER_HOLD_ON: "흔들림 중에는 엎드리고 몸을 보호한 뒤 붙잡습니다.",
  CHECK_DEVICE_DAMAGE_AFTER_SHAKING: "흔들림이 멈춘 뒤 의료기기와 전원선의 손상 여부를 눈으로 확인합니다.",
  AVOID_DAMAGED_POWER_CONNECTION: "손상되거나 젖은 전원 연결부는 사용하지 않습니다.",
  MAINTAIN_SAFE_INDOOR_TEMPERATURE: "공식 한파 안내에 따라 안전한 실내 온도를 유지하고 외출을 줄입니다.",
  PREVENT_CARBON_MONOXIDE: "연료를 태우는 난방기구는 환기와 일산화탄소 안전수칙을 지킵니다.",
  EVACUATE_FOR_FIRE: "화재 시 소지품을 챙기려 머무르지 말고 공식 대피 경로로 즉시 대피합니다.",
  DO_NOT_REENTER_FIRE_AREA: "소방당국이 안전하다고 확인하기 전에는 화재 구역에 다시 들어가지 않습니다.",
  CALL_119_IF_IMMEDIATE_DANGER: "생명에 즉각적인 위험이 있으면 안전한 곳에서 119에 연락합니다.",
});

const DISASTER_ACTIONS = Object.freeze({
  TYPHOON: ["FOLLOW_OFFICIAL_ALERTS", "KEEP_DEVICE_DRY", "NEVER_USE_GENERATOR_INDOORS"],
  EARTHQUAKE: ["DROP_COVER_HOLD_ON", "CHECK_DEVICE_DAMAGE_AFTER_SHAKING", "AVOID_DAMAGED_POWER_CONNECTION"],
  COLD_WAVE: ["FOLLOW_OFFICIAL_ALERTS", "MAINTAIN_SAFE_INDOOR_TEMPERATURE", "PREVENT_CARBON_MONOXIDE"],
  FIRE: ["EVACUATE_FOR_FIRE", "DO_NOT_REENTER_FIRE_AREA", "CALL_119_IF_IMMEDIATE_DANGER"],
});

export function selectApprovedResponseActions({ patient = {}, outage = {}, impactCase = {} }) {
  const codes = new Set([
    ...(DISASTER_ACTIONS[outage.disasterType] ?? ["FOLLOW_OFFICIAL_ALERTS"]),
    "FOLLOW_DEVICE_MANUFACTURER_INSTRUCTIONS",
    "CHECK_DEVICE_POWER",
  ]);
  const context = patient.notificationContext ?? {};
  if (["HIGH", "LIFE_SUSTAINING"].includes(context.powerDependencyLevel)) codes.add("CHECK_BACKUP_POWER");
  if (context.mobilitySupportRequired) codes.add("CONFIRM_EVACUATION_ASSISTANCE");
  if (context.communicationSupport === "TEXT_PREFERRED") codes.add("KEEP_TEXT_CONTACT_AVAILABLE");
  if (impactCase.response === "NEED_HELP") codes.add("CONTACT_REGISTERED_GUARDIAN");
  if (impactCase.response === "EQUIPMENT_ISSUE") codes.add("CONTACT_CARE_TEAM_ON_DEVICE_ALARM");
  for (const code of context.approvedPrecautionCodes ?? []) {
    if (Object.hasOwn(RESPONSE_ACTIONS, code)) codes.add(code);
  }
  return [...codes].map((code) => ({ code, instructionKo: RESPONSE_ACTIONS[code] }));
}
