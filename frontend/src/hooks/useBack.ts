import { useCallback } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

/**
 * 뒤로가기 동작.
 * 어느 경로로 들어왔든 직전 화면으로 돌아갑니다.
 * 방문 기록이 없으면(직접 링크로 들어온 경우) fallback 경로로 갑니다.
 */
export function useBack(fallback: string) {
  const router = useRouter();
  const navigate = useNavigate();

  return useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({ to: fallback } as Parameters<typeof navigate>[0]);
  }, [router, navigate, fallback]);
}
