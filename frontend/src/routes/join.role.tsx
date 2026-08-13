import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { Pad } from "@/components/Pad";
import { RoleCard } from "@/components/RoleCard";

export const Route = createFileRoute("/join/role")({
  head: () => ({
    meta: [
      { title: "역할 선택 · 정전 안심 케어" },
      { name: "description", content: "역할 선택 화면 - 정전 취약가구 안심 케어 앱 프로토타입." },
      { property: "og:title", content: "역할 선택 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "역할 선택 화면 - 정전 취약가구 안심 케어 앱 프로토타입.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PhoneShell>
      <Pad>
        <div className="flex flex-col gap-2">
          <h1 className="t-subheading-lg font-bold leading-[140%] text-ink">
            전기가 끊겨도
            <br />
            혼자 두지 않습니다
          </h1>
          <p className="t-heading-2xl font-bold leading-tight text-ink">누가 쓰실 건가요?</p>
        </div>

        <div className="flex flex-col gap-3.5">
          <RoleCard
            to="/join/code"
            title="코드 입력 창"
            description="보호자에게 받은 코드를 입력해주세요"
            variant="safe"
          />
          <RoleCard
            to="/guardian/join/profile"
            title="보호자 등록"
            description={
              <>
                부모님이나 가족을 대신 등록합니다
                <br />
                복지사도 여기를 누르세요
              </>
            }
            variant="dark"
          />
        </div>
      </Pad>

      <Link
        to="/admin"
        className="fixed bottom-5 right-5 z-50 rounded-full border-2 border-line bg-paper px-4 py-2.5 t-body-sm font-semibold text-dim shadow-[0_8px_20px_-6px_rgba(11,16,23,0.25)] transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/25"
      >
        관리자 모드
      </Link>
    </PhoneShell>
  );
}
