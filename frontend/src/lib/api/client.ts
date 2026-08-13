import type { ApiEnvelope, ApiErrorData, ApiMode, UserRole } from "@/lib/api/types";

const API_BASE_URL = (import.meta.env["VITE_API_BASE_URL"] || "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

export const API_MODE: ApiMode = import.meta.env["VITE_API_MODE"] === "real" ? "real" : "mock";

const tokenKey = (role: UserRole) => `spark-access-token:${role}`;
const patientIdKey = (role: UserRole) => `spark-patient-id:${role}`;
const ACTIVE_ROLE_KEY = "spark-active-role";

export class ApiError extends Error {
  status: number;
  code: string;
  details: ApiErrorData["details"];

  constructor(status: number, error: ApiErrorData) {
    super(error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

export function isRealApiMode() {
  return API_MODE === "real";
}

export function storeAccessToken(role: UserRole, token: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(tokenKey(role), token);
  window.sessionStorage.setItem(ACTIVE_ROLE_KEY, role);
}

export function getAccessToken(role: UserRole) {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(tokenKey(role));
}

export function clearAccessToken(role: UserRole) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(tokenKey(role));
}

export function storePatientId(role: UserRole, patientId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(patientIdKey(role), patientId);
}

export function getPatientId(role: UserRole) {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(patientIdKey(role));
}

export function getActiveRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  const role = window.sessionStorage.getItem(ACTIVE_ROLE_KEY);
  return role === "GUARDIAN" || role === "PATIENT" ? role : null;
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  role?: UserRole;
  idempotencyKey?: string;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, role, idempotencyKey, headers: optionHeaders, ...requestInit } = options;
  const token = role ? getAccessToken(role) : null;
  const headers = new Headers(optionHeaders);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  let response: Response;
  try {
    const init: RequestInit = {
      ...requestInit,
      headers,
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      details: [],
    });
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.error || payload.data === null) {
    if (response.status === 401 && role) clearAccessToken(role);
    throw new ApiError(
      response.status,
      payload.error ?? {
        code: "INVALID_API_RESPONSE",
        message: "서버 응답을 확인할 수 없습니다.",
        details: [],
      },
    );
  }
  return payload.data;
}
