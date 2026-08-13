import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useOutage } from "@/contexts/OutageContext";
import { outage as mockOutage } from "@/data/mock";

/**
 * Context의 정전 값으로 화면 문구를 만듭니다.
 * 값이 비어 있으면 목 데이터로 대체합니다. (화면에서 문구를 하드코딩하지 않습니다)
 */
export function useOutageInfo() {
  const { outage } = useOutage();

  const area = outage.area || mockOutage.region;
  const startAt = outage.startAt || mockOutage.startedAt;
  const endAt = outage.endAt || mockOutage.restoredAt;
  const cause = outage.cause;

  return {
    ...outage,
    area,
    startAt,
    endAt,
    cause,
    /** 예: "구로구 구로동 정전 · 21시 42분부터" */
    bandLabel: `${area} 정전 · ${startAt}부터`,
    /** 예: "복구 예정 22시 34분" */
    restoreLabel: `복구 예정 ${endAt}`,
  };
}

type Mode = "calm" | "outage";

/**
 * 정전 상태가 지정한 mode가 되면 한 번만 이동합니다.
 * 이미 목적지에 있는 경우(같은 화면)에는 중복 이동하지 않습니다.
 *
 * @param onlyOnChange true면 마운트 시점의 상태는 무시하고, 상태가 바뀔 때만 이동합니다.
 */
export function useOutageRedirect(when: Mode, to: string, onlyOnChange = false) {
  const { outage } = useOutage();
  const navigate = useNavigate();
  const movedRef = useRef(false);
  const prevModeRef = useRef<Mode | null>(onlyOnChange ? outage.mode : null);

  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = outage.mode;

    if (outage.mode !== when) {
      movedRef.current = false;
      return;
    }
    if (onlyOnChange && prev === when) return;
    if (movedRef.current) return;
    movedRef.current = true;
    void navigate({ to } as Parameters<typeof navigate>[0]);
  }, [outage.mode, outage.sentAt, when, to, onlyOnChange, navigate]);
}

/** 환자 응답에 따라 보호자가 가야 할 화면 */
const ANSWER_ROUTE = {
  ok: "/guardian/reply",
  guardian: "/guardian/response",
  call: "/guardian/response",
} as const;

/**
 * 보호자 화면 전체가 쓰는 정전 연동입니다.
 * - mode가 'outage'가 되면 /guardian/alert 으로 이동합니다 (이미 있으면 이동하지 않음)
 * - mode가 'calm'으로 돌아오면 /guardian/closed 로 이동합니다
 * - 환자 응답(patientAnswer)이 오면 알맞은 화면으로 이동합니다
 */
export function useGuardianOutageFlow() {
  const { outage } = useOutage();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const startedRef = useRef(outage.mode === "outage" ? outage.sentAt : 0);
  const endedRef = useRef(false);
  const answerRef = useRef(outage.answeredAt);

  const go = (to: string) => {
    if (pathRef.current === to) return;
    void navigate({ to } as Parameters<typeof navigate>[0]);
  };

  // 정전 발생 / 종료
  useEffect(() => {
    if (outage.mode === "outage") {
      endedRef.current = false;
      if (startedRef.current === outage.sentAt) return;
      startedRef.current = outage.sentAt;
      answerRef.current = 0;
      go("/guardian/alert");
      return;
    }
    // calm
    if (startedRef.current === 0 || endedRef.current) return;
    endedRef.current = true;
    startedRef.current = 0;
    go("/guardian/closed");
  }, [outage.mode, outage.sentAt]);

  // 환자 응답
  useEffect(() => {
    if (outage.mode !== "outage") return;
    if (!outage.answeredAt || outage.answeredAt === answerRef.current) return;
    answerRef.current = outage.answeredAt;
    const to = ANSWER_ROUTE[outage.patientAnswer as keyof typeof ANSWER_ROUTE];
    if (to) go(to);
  }, [outage.mode, outage.patientAnswer, outage.answeredAt]);
}
