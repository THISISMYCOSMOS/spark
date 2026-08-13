type TimedImpactCase = {
  outage: {
    startedAt: string | null;
    scheduledStartAt: string | null;
  };
  impactCase: {
    effectiveRuntimeMinutes: number | null;
    responseDueAt: string | null;
  };
};

export function serverRuntimeSeconds(current: TimedImpactCase | null): number | null {
  const minutes = current?.impactCase.effectiveRuntimeMinutes;
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return null;
  return Math.max(0, Math.round(minutes * 60));
}

export function serverRemainingSeconds(
  current: TimedImpactCase | null,
  now = Date.now(),
): number | null {
  const total = serverRuntimeSeconds(current);
  if (total === null || !current) return null;
  const startedAt = current.outage.startedAt ?? current.outage.scheduledStartAt;
  if (!startedAt) return total;
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return total;
  return Math.max(0, total - Math.max(0, Math.floor((now - startedAtMs) / 1000)));
}

export function serverResponseSeconds(
  current: TimedImpactCase | null,
  now = Date.now(),
): number | null {
  const responseDueAt = current?.impactCase.responseDueAt;
  if (!responseDueAt) return null;
  const dueAtMs = Date.parse(responseDueAt);
  if (!Number.isFinite(dueAtMs)) return null;
  return Math.max(0, Math.ceil((dueAtMs - now) / 1000));
}

export function formatKoreanDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  if (minutes > 0) return `${minutes}분`;
  return `${seconds}초`;
}
