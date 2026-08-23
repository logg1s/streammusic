import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { DevicePairingLogin } from "@/components/auth/device-pairing-login";
import { auth, signIn } from "@/lib/auth";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import { loginMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const metadata: Metadata = loginMetadata;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const redirectTo = safeInternalRedirect(callbackUrl);
  if (session?.user) redirect(redirectTo);

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-4xl">
        <Image
          src="/brand/vong-wordmark.png"
          alt="Vọng"
          width={1120}
          height={300}
          preload
          className="h-auto w-40"
        />

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <section>
            <h1 className="text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
              Nhạc của bạn,
              <br />
              ở nguyên chỗ cũ.
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Nối Google Drive, Dropbox hoặc OneDrive rồi phát thẳng từ đó. Không
              tải về máy, không tải lên đâu cả — file vẫn nằm trong kho của bạn.
            </p>

            <div className="mt-10">
              <LoginButton
                signInWithGoogle={async () => {
                  "use server";
                  await signIn("google", { redirectTo });
                }}
              />
            </div>
          </section>

          <DevicePairingLogin redirectTo={redirectTo} />
        </div>

        <p className="mt-8 max-w-md text-xs leading-relaxed text-subtle">
          Đăng nhập chỉ để nhận diện bạn. Quyền đọc file là một bước riêng, cấp
          sau, và bạn có thể gỡ bất cứ lúc nào.
        </p>
      </div>
    </main>
  );
}
