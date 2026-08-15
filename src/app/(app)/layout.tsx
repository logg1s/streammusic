import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileHeader, MobileTabBar } from "@/components/mobile-nav";
import { AudioEngine } from "@/components/player/audio-engine";
import { KeyboardShortcuts } from "@/components/player/keyboard-shortcuts";
import { PlayerBar } from "@/components/player/player-bar";
import { RadioConfigProvider } from "@/components/player/radio-context";
import { RadioController } from "@/components/player/radio-controller";
import { YouTubeEngine } from "@/components/player/youtube-engine";
import { auth } from "@/lib/auth";
import { getYoutubeAccount } from "@/lib/youtube/account";

/**
 * Khung cố định của ứng dụng.
 *
 * AudioEngine và PlayerBar sống ở đây chứ không nằm trong từng page — App Router
 * giữ nguyên layout qua các lần điều hướng, nên nhạc chạy xuyên suốt khi người
 * dùng đi từ album sang nghệ sĩ sang tìm kiếm.
 *
 * Chỉ có ĐÚNG MỘT vùng cuộn: thẻ <main>. Vỏ ngoài khoá `overflow-hidden` để không
 * bao giờ xuất hiện hai thanh cuộn lồng nhau.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // Kiểm cả `id`: mọi truy vấn theo user đều cần nó, và next-auth khai báo nó tuỳ chọn.
  if (!session?.user?.id) redirect("/login");

  // Radio chạy bằng automix của YouTube Music qua InnerTube — không cần khoá lẫn
  // tài khoản, nên luôn bật. Tài khoản chỉ thêm phần cá nhân hoá (gu nhạc lấy từ
  // playlist/subscription của chính user).
  const ytAccount = await getYoutubeAccount(session.user.id);
  const linked = ytAccount?.status === "active";

  return (
    <RadioConfigProvider enabled personalized={linked}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-60 shrink-0 md:block">
            <AppSidebar
              userName={session.user.name ?? session.user.email ?? null}
            />
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <MobileHeader />
            <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-5 md:px-6 md:pt-8 lg:px-8">
              {children}
            </div>
          </main>
        </div>

        <PlayerBar />
        <MobileTabBar />
        <AudioEngine />
        {/* Iframe luôn mount: bài YouTube phát bằng IFrame Player API, và player
            được dựng sẵn từ đầu phiên để cú bấm đầu tiên ra tiếng ngay. */}
        <YouTubeEngine />
        <KeyboardShortcuts />
        <RadioController />
      </div>
    </RadioConfigProvider>
  );
}
