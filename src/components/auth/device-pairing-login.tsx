"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";

interface WebPairingChallenge {
  deviceCode: string;
  displayCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  qrImageUri: string;
  expiresAt: number;
  intervalMs: number;
  target: "web";
}

function parseChallenge(value: unknown): WebPairingChallenge | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const strings = [
    "deviceCode",
    "displayCode",
    "verificationUri",
    "verificationUriComplete",
    "qrImageUri",
  ] as const;
  if (strings.some((key) => typeof record[key] !== "string")) return null;
  if (record.target !== "web") return null;
  if (typeof record.expiresAt !== "number") return null;
  if (typeof record.intervalMs !== "number") return null;
  return record as unknown as WebPairingChallenge;
}

async function responseError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return `Máy chủ trả lỗi ${response.status}.`;
}

export function DevicePairingLogin({ redirectTo }: { redirectTo: string }) {
  const [attempt, setAttempt] = useState(0);
  const [challenge, setChallenge] = useState<WebPairingChallenge | null>(null);
  const [status, setStatus] = useState<
    "starting" | "waiting" | "expired" | "error"
  >("starting");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const begin = async () => {
      setChallenge(null);
      setStatus("starting");
      setMessage(null);
      try {
        const response = await fetch("/api/pairing/start", { method: "POST" });
        if (!response.ok) throw new Error(await responseError(response));
        const next = parseChallenge(await response.json());
        if (!next) throw new Error("Máy chủ trả mã ghép nối không hợp lệ.");
        if (!alive) return;
        setChallenge(next);
        setStatus("waiting");

        const poll = async () => {
          if (!alive) return;
          if (Date.now() >= next.expiresAt) {
            setStatus("expired");
            return;
          }
          try {
            const tokenResponse = await fetch("/api/pairing/token", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ deviceCode: next.deviceCode }),
            });
            if (tokenResponse.status === 202) {
              timer = setTimeout(poll, next.intervalMs);
              return;
            }
            if (!tokenResponse.ok) {
              throw new Error(await responseError(tokenResponse));
            }
            const body: unknown = await tokenResponse.json();
            if (
              typeof body !== "object" ||
              body === null ||
              !("status" in body) ||
              body.status !== "complete"
            ) {
              throw new Error("Máy chủ trả trạng thái ghép nối không hợp lệ.");
            }
            window.location.assign(redirectTo);
          } catch (cause) {
            if (!alive) return;
            setMessage(
              cause instanceof Error
                ? cause.message
                : "Không thể kiểm tra trạng thái ghép nối.",
            );
            timer = setTimeout(poll, Math.max(next.intervalMs, 5_000));
          }
        };
        timer = setTimeout(poll, next.intervalMs);
      } catch (cause) {
        if (!alive) return;
        setStatus("error");
        setMessage(
          cause instanceof Error ? cause.message : "Không thể tạo mã ghép nối.",
        );
      }
    };

    void begin();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [attempt, redirectTo]);

  return (
    <section aria-labelledby="phone-pairing-title" className="mt-8 lg:mt-0">
      <div className="mb-6 flex items-center gap-3 text-xs text-subtle lg:hidden">
        <span className="h-px flex-1 bg-white/10" />
        <span>HOẶC DÙNG ĐIỆN THOẠI</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start gap-3">
          <Smartphone aria-hidden className="mt-0.5 size-5 text-rose-400" />
          <div>
            <h2 id="phone-pairing-title" className="font-medium">
              Quét để đăng nhập web
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Quét QR bằng điện thoại, hoặc mở địa chỉ và nhập mã bên dưới.
            </p>
          </div>
        </div>

        {challenge ? (
          <div className="mt-5 grid grid-cols-[132px_1fr] items-center gap-5">
            <div className="rounded-xl bg-white p-2">
              <Image
                src={`/api/pairing/qr?code=${encodeURIComponent(
                  challenge.displayCode,
                )}`}
                alt={`QR ghép nối mã ${challenge.displayCode}`}
                width={116}
                height={116}
                unoptimized
                className="size-[116px]"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Mã ghép nối</p>
              <p className="mt-1 font-mono text-xl font-semibold tracking-[0.12em]">
                {challenge.displayCode}
              </p>
              <p className="mt-3 break-all text-xs text-subtle">
                {challenge.verificationUri.replace(/^https?:\/\//, "")}
              </p>
              {status === "waiting" ? (
                <p aria-live="polite" className="mt-3 text-xs text-rose-400">
                  Đang chờ xác nhận trên điện thoại…
                </p>
              ) : null}
            </div>
          </div>
        ) : status === "starting" ? (
          <p aria-live="polite" className="mt-5 text-sm text-muted-foreground">
            Đang tạo mã an toàn…
          </p>
        ) : null}

        {message ? (
          <p role="alert" className="mt-4 text-xs text-red-400">
            {message}
          </p>
        ) : null}
        {status === "expired" || status === "error" ? (
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            <RefreshCw aria-hidden className="size-4" />
            Tạo mã mới
          </button>
        ) : null}
      </div>
    </section>
  );
}
