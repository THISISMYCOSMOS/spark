import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { useOutage, type DemoSettings } from "@/contexts/OutageContext";

export type { DemoSettings };

/** 정전 알림에 대한 사용자의 응답 */
export type AlertAnswer = "ok" | "guardian" | "call" | "none" | null;

/** /alert 화면에서 /alert/sent로 이동할 때 스냅샷 */
export interface AlertSnapshot {
  remaining: number;
  countdown: number;
}

interface AppContextValue {
  /** 보호자에게 받은 참여 코드 */
  code: string;
  setCode: Dispatch<SetStateAction<string>>;
  /** /alert 화면에서 선택한 응답 */
  answer: AlertAnswer;
  setAnswer: (answer: AlertAnswer) => void;
  /** /alert/sent 팝업을 이미 본 적이 있는지 */
  alertSentSeen: boolean;
  setAlertSentSeen: (seen: boolean) => void;
  /** /alert에서 이동할 때의 남은 시간 스냅샷 */
  alertSnapshot: AlertSnapshot | null;
  setAlertSnapshot: (snapshot: AlertSnapshot | null) => void;
  /** 시연용 설정 (OutageContext에서 공유합니다) */
  demo: DemoSettings;
  /** 무응답 타이머를 8초로 줄입니다 */
  shortenEscalation: () => void;
  /** 모든 카운트다운 배속을 60배 / 1배로 전환합니다 */
  toggleFast: () => void;
  /** 배터리가 보호자 도착보다 먼저 떨어지는 상황으로 바꿉니다 */
  batteryFirst: () => void;
  /** 모든 앱 상태를 초기화하고 처음으로 돌아갈 때 사용 */
  reset: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState("");
  const [answer, setAnswer] = useState<AlertAnswer>(null);
  const [alertSentSeen, setAlertSentSeen] = useState(false);
  const [alertSnapshot, setAlertSnapshot] = useState<AlertSnapshot | null>(null);

  const { demo, shortenEscalation, toggleFast, batteryFirst, resetDemo } = useOutage();

  const reset = () => {
    setCode("");
    setAnswer(null);
    setAlertSentSeen(false);
    setAlertSnapshot(null);
    resetDemo();
  };

  return (
    <AppContext.Provider
      value={{
        code,
        setCode,
        answer,
        setAnswer,
        alertSentSeen,
        setAlertSentSeen,
        alertSnapshot,
        setAlertSnapshot,
        demo,
        shortenEscalation,
        toggleFast,
        batteryFirst,
        reset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
