import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { auth, optionalUserId, signIn } from "@/lib/auth";
import {
  approveDevicePairing,
  inspectDevicePairing,
  normalizeTvPairingCode,
  type PairingApproval,
  TvPairingCodeError,
} from "@/lib/tv-pairing";

export const dynamic = "force-dynamic";

const TARGET_LABEL = {
  tv: "Android TV",
  web: "trình duyệt web",
} as const;

export default async function PairingPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    paired?: string;
    error?: string;
  }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const code = normalizeTvPairingCode(params.code ?? "");
  const callbackUrl = code ? `/pair?code=${encodeURIComponent(code)}` : "/pair";
  let approval: PairingApproval | null = null;

  if (code.length === 10 && params.paired === undefined) {
    try {
      approval = await inspectDevicePairing(code);
    } catch (error) {
      if (!(error instanceof TvPairingCodeError)) throw error;
    }
  }

  const pairedTarget =
    params.paired === "tv" || params.paired === "web"
      ? params.paired
      : null;

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

        {pairedTarget ? (
          <div className="mt-10">
            <p className="text-sm font-medium text-rose-400">Đã ghép nối</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {TARGET_LABEL[pairedTarget]} đã sẵn sàng.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Bạn có thể đóng trang này và tiếp tục trên thiết bị vừa xác nhận.
            </p>
            <Link className="mt-8 inline-block text-sm text-rose-400" href="/">
              Về trang chủ
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-10 text-sm font-medium text-rose-400">
              XÁC NHẬN TRÊN ĐIỆN THOẠI
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Ghép nối thiết bị
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Quét QR trên TV hoặc web để mã tự điền, hoặc nhập mã thủ công bên
              dưới. Chỉ xác nhận nếu chính bạn vừa yêu cầu mã này.
            </p>

            <form action="/pair" className="mt-8">
              <label htmlFor="code" className="text-sm font-medium">
                Mã trên thiết bị
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
                autoFocus={code.length === 0}
                className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 font-mono text-xl uppercase tracking-[0.14em] outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium hover:bg-white/15"
              >
                Kiểm tra mã
              </button>
            </form>

            {(params.error === "invalid" ||
              (code.length === 10 && approval === null)) ? (
              <p role="alert" className="mt-5 text-sm text-red-400">
                Mã không hợp lệ hoặc đã hết hạn. Hãy tạo mã mới trên thiết bị.
              </p>
            ) : null}

            {approval ? (
              session?.user ? (
                <form
                  className="mt-6 border-t border-white/10 pt-6"
                  action={async () => {
                    "use server";
                    const userId = await optionalUserId();
                    if (!userId) {
                      redirect(
                        `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
                      );
                    }
                    try {
                      const target = await approveDevicePairing(userId, code);
                      redirect(`/pair?paired=${target}`);
                    } catch (error) {
                      if (error instanceof TvPairingCodeError) {
                        redirect(
                          `/pair?code=${encodeURIComponent(code)}&error=invalid`,
                        );
                      }
                      throw error;
                    }
                  }}
                >
                  <p className="text-sm text-muted-foreground">
                    Mã này đang yêu cầu đăng nhập cho{" "}
                    <strong className="text-foreground">
                      {TARGET_LABEL[approval.target]}
                    </strong>
                    .
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tài khoản: {session.user.email ?? session.user.name ?? "của bạn"}
                  </p>
                  <button
                    type="submit"
                    className="mt-4 w-full rounded-xl bg-rose-500 px-4 py-3 font-semibold text-white hover:bg-rose-400"
                  >
                    Ghép nối {TARGET_LABEL[approval.target]}
                  </button>
                </form>
              ) : (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <p className="mb-4 text-sm text-muted-foreground">
                    Đăng nhập trên điện thoại để xác nhận {TARGET_LABEL[approval.target]}{" "}
                    này thuộc tài khoản của bạn.
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
