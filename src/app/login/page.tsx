import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { auth, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  // Chỉ nhận đường dẫn nội bộ: chặn URL tuyệt đối và "//host" (open redirect).
  const redirectTo =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/";
  if (session?.user) redirect(redirectTo);

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full border border-accent">
            <span className="size-2 rounded-full bg-accent" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Vọng</span>
        </div>

        <h1 className="mt-10 text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
          Nhạc của bạn,
          <br />
          ở nguyên chỗ cũ.
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Nối Google Drive, Dropbox hoặc OneDrive rồi phát thẳng từ đó. Không tải
          về máy, không tải lên đâu cả — file vẫn nằm trong kho của bạn.
        </p>

        <div className="mt-10">
          <LoginButton
            signInWithGoogle={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-subtle">
          Đăng nhập chỉ để nhận diện bạn. Quyền đọc file là một bước riêng, cấp
          sau, và bạn có thể gỡ bất cứ lúc nào.
        </p>
      </div>
    </main>
  );
}
