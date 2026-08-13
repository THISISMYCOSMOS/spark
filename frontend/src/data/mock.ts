/**
 * 프로토타입용 목 데이터.
 * 화면에서는 값을 직접 쓰지 말고 이 파일에서만 가져다 씁니다.
 * 이후 실제 데이터로 교체할 수 있도록 타입을 명확히 정의합니다.
 */

export type Tone = "safe" | "warn" | "crit";
export type TextTone = Tone | "dim";

/** 대상자 정보 */
export interface Patient {
  name: string;
  age: number;
  address: string;
  condition: string;
}

/** 사용 기기 */
export interface Device {
  id: string;
  name: string;
  /** 소비 전력(W). 배터리 등 전력을 쓰지 않는 기기는 null */
  watt: number | null;
  /** 사용 방식 설명 (예: 항상 켜둠) */
  usage: string;
  /** 예비 배터리처럼 지속 시간이 있는 기기의 잔여 시간(초) */
  runtimeSeconds?: number;
  /** 현재 상태 문구 */
  status: string;
  /** 상태 문구 색조 */
  statusTone?: Tone;
}

/** 비상 연락처 */
export interface Contact {
  id: string;
  name: string;
  /** 관계 또는 역할 (딸, 복지사, 담당자) */
  relation: string;
  /** 도달 시간·연락 가능 시간대 설명 */
  availability: string;
  /** 1이 가장 먼저 연락 */
  priority: number;
  /** 이 연락처가 담당하는 역할 문구 */
  role: string;
  /** 역할 문구 색조 (dim은 단순 정보용) */
  roleTone?: TextTone;
  /** 전화번호 */
  phone: string;
}

/** 사전 준비 점검 항목 */
export interface ReadinessItem {
  id: string;
  label: string;
  status: "done" | "overdue";
  /** 상태 보충 설명 */
  note: string;
}

/** 자율 동작(자동 판단) 시간, 단위: 초 */
export interface Autonomy {
  /** 평상시 기준 */
  normalSeconds: number;
  /** 정전 시 기준 */
  outageSeconds: number;
  /** 보호자 화면 기준 */
  guardianSeconds: number;
}

/** 정전 정보 */
export interface Outage {
  region: string;
  /** 시작 시각 (HH:mm) */
  startedAt: string;
  /** 복구 예정 시각 (HH:mm) */
  restoredAt: string;
  /** 정전 지속 시간(분) */
  durationMinutes: number;
}

/** 생체 수치 */
export interface Vital {
  id: string;
  label: string;
  unit: string;
  /** 평소 값 */
  usual: number;
  /** 상태별 현재 값 */
  current: Record<Tone, number>;
  /** 상태별 판정 문구 */
  verdict: Record<Tone, string>;
}

/** Core의 AI 대응책 응답과 동일한 표시 계약 */
export interface AiResponsePlanAction {
  code: string;
  instructionKo: string;
}

export interface AiResponsePlan {
  status: "PROPOSED";
  reviewRequired: boolean;
  policyVersion: string;
  actions: AiResponsePlanAction[];
  narrative: string;
  narrativeSource: "AI" | "RULE_FALLBACK";
  model: string | null;
  requestId: string | null;
  fallbackReason: string | null;
}

export const patient: Patient = {
  name: "김영자",
  age: 78,
  address: "구로구 구로동 현대아파트 101동 902호",
  condition: "만성폐쇄성폐질환",
};

export const devices: Device[] = [
  {
    id: "oxygen",
    name: "산소발생기",
    watt: 90,
    usage: "이 기계는 끄면 안 됩니다",
    status: "지금 잘 돌아갑니다",
    statusTone: "safe",
  },
  {
    id: "bed",
    name: "전동침대",
    watt: null,
    usage: "이것만 꺼도 2시간 13분 더 씁니다",
    status: "지금 켜져 있습니다",
    statusTone: "warn",
  },
  {
    id: "battery",
    name: "예비 배터리",
    watt: null,
    usage: "3개월 전에 점검했습니다",
    runtimeSeconds: 12000,
    status: "100% 차 있습니다",
    statusTone: "warn",
  },
];

export const contacts: Contact[] = [
  {
    id: "daughter",
    name: "김수현",
    relation: "딸",
    availability: "차로 12분",
    priority: 1,
    role: "가장 먼저 연락합니다",
    roleTone: "safe",
    phone: "010-1234-5678",
  },
  {
    id: "worker",
    name: "이정호",
    relation: "복지사",
    availability: "평일 낮",
    priority: 2,
    role: "따님이 안 받으면 연락합니다",
    roleTone: "safe",
    phone: "010-2345-6789",
  },
  {
    id: "center",
    name: "구로1동 주민센터",
    relation: "담당자",
    availability: "평일 근무 시간",
    priority: 3,
    role: "오래 걸리면 연락합니다",
    roleTone: "dim",
    phone: "02-860-3000",
  },
];

export const readiness: ReadinessItem[] = [
  {
    id: "charge",
    label: "예비 배터리 충전",
    status: "done",
    note: "완료",
  },
  {
    id: "contacts",
    label: "보호자 연락처 확인",
    status: "done",
    note: "완료",
  },
  {
    id: "capacity",
    label: "배터리 용량 점검",
    status: "overdue",
    note: "3개월 지남",
  },
];

export const autonomy: Autonomy = {
  normalSeconds: 12000,
  outageSeconds: 10080,
  guardianSeconds: 2460,
};

export const outage: Outage = {
  region: "구로구",
  startedAt: "21시 42분",
  restoredAt: "22시 34분",
  durationMinutes: 52,
};

/**
 * 실제 API 연결 전 화면 검증용 대응책입니다.
 * Core의 AiResponsePlanComposer 반환 구조를 그대로 따릅니다.
 */
export const aiResponsePlan: AiResponsePlan = {
  status: "PROPOSED",
  reviewRequired: true,
  policyVersion: "DISASTER_RESPONSE_PLAN_V1",
  narrative:
    "산소발생기의 전원 연결과 배터리 잔량을 먼저 확인하세요. 예비 전원을 사용할 수 있는지 살펴보고, 기기는 등록된 제조사 지침과 의료진의 기존 계획에 따라 사용하세요.",
  narrativeSource: "AI",
  actions: [
    {
      code: "CHECK_DEVICE_POWER",
      instructionKo: "산소발생기의 전원 연결과 배터리 잔량을 확인합니다.",
    },
    {
      code: "CHECK_BACKUP_POWER",
      instructionKo: "예비 전원을 사용할 수 있는지와 남은 시간을 확인합니다.",
    },
    {
      code: "FOLLOW_DEVICE_MANUFACTURER_INSTRUCTIONS",
      instructionKo: "기기는 등록된 제조사 지침과 의료진의 기존 계획에 따라 사용합니다.",
    },
  ],
  model: null,
  requestId: null,
  fallbackReason: null,
};

/** 긴급 신고 번호 */
export const emergencyNumber = "119";

/** 화면에서 반복해서 쓰는 안내 문구 */
export const messages = {
  /** 119에 전달할 상황 설명 */
  emergencySituation: "정전으로 산소발생기가 멈췄습니다",
  /** 보호자에게 자동 발송되는 문자 내용 */
  guardianSms: ["어머니 댁에 정전이 났습니다.", "산소발생기는 예비 배터리로 작동 중입니다."],
} as const;

/** 보호자에게 자동으로 넘어가기까지의 시간(초) */
export const escalationSeconds = 180;

export const vitals: Vital[] = [
  {
    id: "spo2",
    label: "산소포화도",
    unit: "%",
    usual: 97,
    current: { safe: 97, warn: 91, crit: 84 },
    verdict: {
      safe: "평소와 같아요",
      warn: "조금 낮아요",
      crit: "많이 낮아요",
    },
  },
  {
    id: "pulse",
    label: "맥박",
    unit: "회",
    usual: 70,
    current: { safe: 72, warn: 78, crit: 104 },
    verdict: {
      safe: "평소와 같아요",
      warn: "조금 빨라요",
      crit: "많이 빨라요",
    },
  },
];

/** 지역별 대상 가구 현황 */
export interface RegionHouseholds {
  /** 등록 가구 수 */
  registered: number;
  /** 전력의존 가구 수 */
  powerDependent: number;
  /** 보호자 수 */
  guardians: number;
  /** 담당 기관 */
  agency: string;
}

export const regionHouseholds: Record<string, RegionHouseholds> = {
  구로구: { registered: 12, powerDependent: 3, guardians: 5, agency: "구로1동 주민센터" },
  영등포구: { registered: 8, powerDependent: 2, guardians: 3, agency: "영등포동 주민센터" },
  관악구: { registered: 15, powerDependent: 4, guardians: 7, agency: "신림동 주민센터" },
};

/** 관리자 화면에서 지역 문자열로 가구 현황을 찾습니다 */
export function findRegionHouseholds(area: string): RegionHouseholds | null {
  const key = Object.keys(regionHouseholds).find((name) => area.includes(name));
  return key ? regionHouseholds[key]! : null;
}
