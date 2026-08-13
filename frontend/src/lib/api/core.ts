const CORE_API_BASE_URL = (
  import.meta.env["VITE_CORE_API_BASE_URL"] || "http://127.0.0.1:8100"
).replace(/\/+$/, "");

export interface DisasterProcessResult {
  outage: {
    id: string;
    status: string;
    regionCode: string;
    title: string;
    startedAt: string | null;
    expectedEndAt: string | null;
  };
  matchedPatients: number;
  createdCases: number;
  skippedCases: number;
  acceptedNotifications: number;
  statusChecksStarted: number;
  alarmStarted: boolean;
  notificationFailures: Array<{
    impactCaseId: string;
    errorCode: string;
    retryable: boolean;
  }>;
}

export interface DisasterImageProposal {
  proposalId: string;
  expiresAt: string;
  status: "PROPOSED";
  reviewRequired: true;
  recognizedText: string;
  disasterType: "TYPHOON" | "EARTHQUAKE" | "COLD_WAVE" | "FIRE";
  guidanceItemsKo: string[];
}

export interface RecoveryProcessResult {
  outageId: string;
  outageStatus: "RECOVERY_REPORTED";
  affectedCases: number;
  recoveryChecksStarted: number;
  transitionedCases: number;
  notificationFailures: Array<{
    impactCaseId: string;
    errorCode: string;
    retryable: boolean;
  }>;
}

async function coreResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as {
    data: T | null;
    error: { code: string; message: string } | null;
  };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "재난 알림을 처리하지 못했습니다.");
  }
  return payload.data;
}

export async function processDisasterPdf(file: File): Promise<DisasterProcessResult> {
  let response: Response;
  try {
    response = await fetch(`${CORE_API_BASE_URL}/api/v1/disasters/process`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
  } catch {
    throw new Error("Core 서버에 연결할 수 없습니다. 실행 상태를 확인해 주세요.");
  }

  return coreResponse<DisasterProcessResult>(response);
}

export async function recognizeDisasterImage(file: File): Promise<DisasterImageProposal> {
  let response: Response;
  try {
    response = await fetch(`${CORE_API_BASE_URL}/api/v1/disasters/recognize-image`, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
  } catch {
    throw new Error("Core 서버에 연결할 수 없습니다. 실행 상태를 확인해 주세요.");
  }
  return coreResponse<DisasterImageProposal>(response);
}

export async function processDisasterImage(input: {
  proposalId: string;
  regionCode: string;
  startedAt: string;
  expectedEndAt: string;
}): Promise<DisasterProcessResult> {
  let response: Response;
  try {
    response = await fetch(`${CORE_API_BASE_URL}/api/v1/disasters/process-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Core 서버에 연결할 수 없습니다. 실행 상태를 확인해 주세요.");
  }
  return coreResponse<DisasterProcessResult>(response);
}

export async function reportOutageRecovery(outageId: string): Promise<RecoveryProcessResult> {
  let response: Response;
  try {
    response = await fetch(
      `${CORE_API_BASE_URL}/api/v1/outages/${encodeURIComponent(outageId)}/recovery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveredAt: new Date().toISOString() }),
      },
    );
  } catch {
    throw new Error("Core 서버에 연결할 수 없습니다. 실행 상태를 확인해 주세요.");
  }
  return coreResponse<RecoveryProcessResult>(response);
}
