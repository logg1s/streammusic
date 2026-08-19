import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { auth, optionalUserId, signIn } from "@/lib/auth";
import {
  approveTvPairing,
  normalizeTvPairingCode,
  TvPairingCodeError,
} from "@/lib/tv-pairing";

export const dynamic = "force-dynamic";

export default async function TvPairingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; paired?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const code = normalizeTvPairingCode(params.code ?? "");
  const callbackUrl = code ? `/tv?code=${encodeURIComponent(code)}` : "/tv";

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl sm:p-10">
        <Image
          src="/brand/vong-wordmark.png"
          alt="Vọng"
          width={1120}
          height={300}
          preload
          className="h-auto w-36"
        />

        {params.paired === "1" ? (
          <div className="mt-10">
            <p className="text-sm font-medium text-rose-400">Đã ghép nối</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              TV đã sẵn sàng phát nhạc.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Bạn có thể đóng trang này và tiếp tục trên TV.
            </p>
            <Link className="mt-8 inline-block text-sm text-rose-400" href="/">
              Về trang chủ
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-10 text-3xl font-semibold tracking-tight">
              Ghép nối Android TV
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Nhập mã đang hiển thị trên TV. Chỉ xác nhận nếu chính bạn vừa yêu
              cầu mã này.
            </p>

            <form action="/tv" className="mt-8">
              <label htmlFor="code" className="text-sm font-medium">
                Mã trên TV
              </label>
              <input
                id="code"
                name="code"
                defaultValue={code}
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                maxLength={11}
                placeholder="ABCDE-FGHIJ"
                className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 font-mono text-xl uppercase tracking-[0.14em] outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium hover:bg-white/15"
              >
                Kiểm tra mã
              </button>
            </form>

            {params.error === "invalid" ? (
              <p className="mt-5 text-sm text-red-400">
                Mã không hợp lệ hoặc đã hết hạn. Hãy tạo mã mới trên TV.
              </p>
            ) : null}

            {code.length === 10 ? (
              session?.user ? (
                <form
                  className="mt-6 border-t border-white/10 pt-6"
                  action={async () => {
                    "use server";
                    const userId = await optionalUserId();
                    if (!userId)
                      redirect(
                        `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
                      );
                    try {
                      await approveTvPairing(userId, code);
                    } catch (error) {
                      if (error instanceof TvPairingCodeError) {
                        redirect(
                          `/tv?code=${encodeURIComponent(code)}&error=invalid`,
                        );
                      }
                      throw error;
                    }
                    redirect("/tv?paired=1");
                  }}
                >
                  <p className="text-sm text-muted-foreground">
                    Đang đăng nhập với{" "}
                    {session.user.email ??
                      session.user.name ??
                      "tài khoản của bạn"}
                    .
                  </p>
                  <button
                    type="submit"
                    className="mt-4 w-full rounded-xl bg-rose-500 px-4 py-3 font-semibold text-white hover:bg-rose-400"
                  >
                    Ghép nối TV với tài khoản này
                  </button>
                </form>
              ) : (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <p className="mb-4 text-sm text-muted-foreground">
                    Đăng nhập để xác nhận TV này thuộc tài khoản của bạn.
                  </p>
                  <LoginButton
                    signInWithGoogle={async () => {
                      "use server";
                      await signIn("google", { redirectTo: callbackUrl });
                    }}
                  />
                </div>
              )
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
