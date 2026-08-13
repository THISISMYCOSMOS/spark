export const NotificationType = Object.freeze({
  PLANNED_OUTAGE_PREPARE: "PLANNED_OUTAGE_PREPARE",
  OUTAGE_STATUS_CHECK: "OUTAGE_STATUS_CHECK",
  GUARDIAN_OUTAGE_NOTICE: "GUARDIAN_OUTAGE_NOTICE",
  GUARDIAN_ACTION_REQUIRED: "GUARDIAN_ACTION_REQUIRED",
  CRITICAL_ALERT: "CRITICAL_ALERT",
  RECOVERY_CONFIRMATION: "RECOVERY_CONFIRMATION",
});

const templates = {
  [NotificationType.PLANNED_OUTAGE_PREPARE]: ({ patientName, startsAt }) =>
    `[정전 대비] ${patientName}님 지역에 ${startsAt} 정전이 예정되어 있습니다. 보조전원과 연락수단을 확인해 주세요.`,
  [NotificationType.OUTAGE_STATUS_CHECK]: ({ patientName, responseUrl }) =>
    `[정전 확인] ${patientName}님, 의료기기와 현재 상태를 확인해 주세요. 1회 응답: ${responseUrl}`,
  [NotificationType.GUARDIAN_OUTAGE_NOTICE]: ({ patientName }) =>
    `[정전 알림] ${patientName}님 지역에 정전이 발생했습니다. 연락 가능한 상태를 유지해 주세요.`,
  [NotificationType.GUARDIAN_ACTION_REQUIRED]: ({ patientName, reason }) =>
    `[보호자 대응 요청] ${patientName}님의 확인이 필요합니다. 사유: ${reason}`,
  [NotificationType.CRITICAL_ALERT]: ({ patientName, reason }) =>
    `[긴급 확인] ${patientName}님의 정전 대응 위험도가 높습니다. 사유: ${reason}. 기관 절차에 따라 즉시 확인해 주세요.`,
  [NotificationType.RECOVERY_CONFIRMATION]: ({ patientName, responseUrl }) =>
    `[복구 확인] ${patientName}님, 가구 전력과 의료기기가 정상인지 확인해 주세요. 1회 응답: ${responseUrl}`,
};

export class NotificationTemplateRegistry {
  constructor() {
    this.organizationTemplates = new Map();
  }

  set({ organizationId, type, renderer }) {
    if (!organizationId) throw new TypeError("organizationId is required");
    if (!templates[type]) throw new TypeError(`Unknown notification template: ${type}`);
    if (typeof renderer !== "function") throw new TypeError("renderer must be a function");
    this.organizationTemplates.set(`${organizationId}:${type}`, renderer);
  }

  render(type, variables, organizationId = null) {
    const renderer =
      (organizationId && this.organizationTemplates.get(`${organizationId}:${type}`)) ?? templates[type];
    if (!renderer) throw new TypeError(`Unknown notification template: ${type}`);
    return renderer(variables);
  }
}

export const defaultTemplateRegistry = new NotificationTemplateRegistry();

export function renderTemplate(type, variables, organizationId = null) {
  return defaultTemplateRegistry.render(type, variables, organizationId);
}
