"use client";

import type { PlayableTrack } from "@/lib/library";
import { usePlayer } from "@/store/player";

/** Lô đầu tiên xin nhiều hơn lô nạp thêm: người dùng vừa bấm Radio nên muốn thấy ngay một danh sách. */
const FIRST_BATCH = 12;

/**
 * Bắt đầu radio từ một bài: đặt hàng đợi về đúng bài đó rồi xin lô gợi ý đầu tiên.
 * Từ lô thứ hai trở đi RadioController tự lo.
 */
export async function startRadioFor(seed: PlayableTrack): Promise<void> {
  // Đổi hàng đợi TRƯỚC khi gọi API: bài gốc phát ngay, không chờ mạng.
  usePlayer.getState().startRadio(seed);

  try {
    const res = await fetch("/api/radio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seedId: seed.id,
        exclude: [seed.id],
        limit: FIRST_BATCH,
      }),
    });
    const body = (await res.json()) as {
      tracks?: PlayableTrack[];
      error?: string;
    };
    if (!res.ok) throw new Error(body.error ?? "Không lấy được gợi ý.");

    const tracks = body.tracks ?? [];
    usePlayer.getState().appendTracks(tracks);
    usePlayer.getState().setRadioStatus("idle", tracks.length === 0);
  } catch (error) {
    // Lỗi gợi ý không được làm đứt bài đang phát: chỉ ghi vào trạng thái radio,
    // panel hàng đợi hiện nguyên văn lý do.
    usePlayer
      .getState()
      .setRadioStatus(
        "error",
        true,
        error instanceof Error ? error.message : "Không lấy được gợi ý.",
      );
  }
}
