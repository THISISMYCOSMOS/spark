import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { autonomy, escalationSeconds as baseEscalationSeconds } from "@/data/mock";

/** 정전 상태 모양 */
export type PatientAnswer = "none" | "ok" | "guardian" | "call";

export interface OutageState {
  mode: "calm" | "outage";
  area: string;
  startAt: string;
  endAt: string;
  cause: string;
  sentAt: number;
  /** 환자가 경보 화면에서 누른 값 */
  patientAnswer: PatientAnswer;
  /** 환자가 답한 시각(ms). 답이 없으면 0 */
  answeredAt: number;
}

/** sendOutage에 넘기는 값 */
export type OutagePayload = Partial<Omit<OutageState, "mode">>;

const STORAGE_KEY = "outage-state";
const CHANNEL_NAME = "outage-channel";

const calmState: OutageState = {
  mode: "calm",
  area: "",
  startAt: "",
  endAt: "",
  cause: "",
  sentAt: 0,
  patientAnswer: "none",
  answeredAt: 0,
};

function isOutageState(value: unknown): value is OutageState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v["mode"] === "calm" || v["mode"] === "outage") &&
    typeof v["area"] === "string" &&
    typeof v["startAt"] === "string" &&
    typeof v["endAt"] === "string" &&
    typeof v["cause"] === "string" &&
    typeof v["sentAt"] === "number" &&
    (v["patientAnswer"] === undefined ||
      v["patientAnswer"] === "none" ||
      v["patientAnswer"] === "ok" ||
      v["patientAnswer"] === "guardian" ||
      v["patientAnswer"] === "call")
  );
}

/** localStorage에서 저장된 상태를 읽습니다. 없거나 깨졌으면 null */
function readStored(): OutageState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isOutageState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 시연용 설정값. 실제 서비스에는 존재하지 않습니다. */
export interface DemoSettings {
  /** 무응답 에스컬레이션 시간(초) */
  escalationSeconds: number;
  /** 정전 시 자립시간(초) */
  autonomySeconds: number;
  /** 보호자 도착까지 걸리는 시간(초) */
  arrivalSeconds: number;
  /** 카운트다운 배속 */
  speed: number;
}

export const defaultDemo: DemoSettings = {
  escalationSeconds: baseEscalationSeconds,
  autonomySeconds: autonomy.outageSeconds,
  arrivalSeconds: 1080,
  speed: 1,
};

interface OutageContextValue {
  outage: OutageState;
  /** 정전 발생: mode를 'outage'로 바꾸고 값을 채웁니다 */
  sendOutage: (payload?: OutagePayload) => void;
  /** 정전 종료: mode를 'calm'으로 되돌리고 값을 비웁니다 */
  endOutage: () => void;
  /** 환자 응답을 공유합니다 */
  setPatientAnswer: (answer: PatientAnswer) => void;
  /** 시연용 설정 (환자·보호자·관리자 화면이 함께 씁니다) */
  demo: DemoSettings;
  shortenEscalation: () => void;
  toggleFast: () => void;
  batteryFirst: () => void;
  resetDemo: () => void;
}

const OutageContext = createContext<OutageContextValue | null>(null);

export function OutageProvider({ children }: { children: ReactNode }) {
  const [outage, setOutage] = useState<OutageState>(calmState);
  const [demo, setDemo] = useState<DemoSettings>(defaultDemo);

  const channelRef = useRef<BroadcastChannel | null>(null);
  /** 원격(다른 탭)에서 온 변경은 다시 방송하지 않습니다 */
  const fromRemoteRef = useRef(false);
  /** 첫 마운트 시 저장/방송을 건너뜁니다 */
  const hydratedRef = useRef(false);

  // 1) 앱이 처음 뜰 때 localStorage에서 초기 상태를 읽습니다 (SSR 안전)
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      fromRemoteRef.current = true;
      setOutage({ ...calmState, ...stored });
    }
    hydratedRef.current = true;
  }, []);

  // 2) 다른 탭에서 온 메시지를 반영합니다
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent) => {
        if (!isOutageState(event.data)) return;
        fromRemoteRef.current = true;
        setOutage({ ...calmState, ...event.data });
      };
      return () => {
        channel.onmessage = null;
        channel.close();
        channelRef.current = null;
      };
    }

    // 3) BroadcastChannel 미지원 시 storage 이벤트로 대체합니다
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (!isOutageState(parsed)) return;
        fromRemoteRef.current = true;
        setOutage({ ...calmState, ...parsed });
      } catch {
        /* 무시 */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 4) 상태가 바뀌면 저장하고 방송합니다 (원격 변경은 방송하지 않음)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydratedRef.current) return;

    const wasRemote = fromRemoteRef.current;
    fromRemoteRef.current = false;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(outage));
    } catch {
      /* 저장 실패는 무시 */
    }

    if (wasRemote) return;
    channelRef.current?.postMessage(outage);
  }, [outage]);

  const sendOutage = useCallback((payload: OutagePayload = {}) => {
    setOutage({
      ...calmState,
      ...payload,
      mode: "outage",
      sentAt: payload.sentAt ?? Date.now(),
      patientAnswer: "none",
      answeredAt: 0,
    });
  }, []);

  const endOutage = useCallback(() => {
    setOutage({ ...calmState });
  }, []);

  const setPatientAnswer = useCallback((answer: PatientAnswer) => {
    setOutage((prev) => {
      if (prev.patientAnswer === answer) return prev;
      return {
        ...prev,
        patientAnswer: answer,
        answeredAt: answer === "none" ? 0 : Date.now(),
      };
    });
  }, []);

  const shortenEscalation = useCallback(() => setDemo((d) => ({ ...d, escalationSeconds: 8 })), []);
  const toggleFast = useCallback(
    () => setDemo((d) => ({ ...d, speed: d.speed === 1 ? 60 : 1 })),
    [],
  );
  const batteryFirst = useCallback(
    () => setDemo((d) => ({ ...d, autonomySeconds: 600, arrivalSeconds: 1500 })),
    [],
  );
  const resetDemo = useCallback(() => setDemo(defaultDemo), []);

  return (
    <OutageContext.Provider
      value={{
        outage,
        sendOutage,
        endOutage,
        setPatientAnswer,
        demo,
        shortenEscalation,
        toggleFast,
        batteryFirst,
        resetDemo,
      }}
    >
      {children}
    </OutageContext.Provider>
  );
}

export function useOutage() {
  const ctx = useContext(OutageContext);
  if (!ctx) {
    throw new Error("useOutage must be used within OutageProvider");
  }
  return ctx;
}
