"use client";

import { useEffect } from "react";
import { usePlayer } from "@/store/player";

/**
 * Phím tắt toàn cục cho trình phát.
 *
 * Không có giao diện, chỉ gắn một listener ở tầng document. Đặt trong layout để
 * hoạt động ở mọi trang.
 */

const SEEK_STEP = 5;

/** Đang gõ trong ô nhập thì phím thuộc về ô đó, không phải trình phát. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function KeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;

      const player = usePlayer.getState();
      if (player.queue.length === 0) return;

      const withModifier = e.ctrlKey || e.metaKey;

      switch (e.key) {
        case " ":
          // Mặc định phím cách cuộn trang — chặn lại, nếu không mỗi lần phát/dừng
          // là danh sách bài lại nhảy một đoạn.
          e.preventDefault();
          player.toggle();
          break;

        case "ArrowRight":
          e.preventDefault();
          if (withModifier) player.next();
          else player.seek(Math.min(player.duration, player.currentTime + SEEK_STEP));
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (withModifier) player.previous();
          else player.seek(Math.max(0, player.currentTime - SEEK_STEP));
          break;

        case "m":
        case "M":
          if (withModifier) return;
          e.preventDefault();
          player.toggleMute();
          break;

        default:
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
