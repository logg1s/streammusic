import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

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

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-10"
        >
          <button
            type="submit"
            className="w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.02]"
          >
            Đăng nhập bằng Google
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-subtle">
          Đăng nhập chỉ để nhận diện bạn. Quyền đọc file là một bước riêng, cấp
          sau, và bạn có thể gỡ bất cứ lúc nào.
        </p>
      </div>
    </main>
  );
}
