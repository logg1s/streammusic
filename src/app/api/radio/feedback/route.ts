import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { radioFeedback, youtubeTracks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { normalizeKey } from "@vong/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNALS = ["skip", "finish", "block"] as const;

/**
 * Compatibility endpoint ghi lại phản ứng với một video YouTube.
 *
 * Client hiện tại dùng YouTube up-next và tombstone trong phiên, nên không gọi route
 * này và radio hiện tại cũng không đọc `radio_feedback`. Giữ contract để client cũ
 * không vỡ; "block" vẫn đánh dấu metadata video là không nhúng được.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      videoId?: string;
      artistName?: string | null;
      signal?: string;
    };
    const { videoId } = body;
    if (!videoId) return jsonError("Thiếu videoId", 400);

    const signal = SIGNALS.find((value) => value === body.signal);
    if (!signal) return jsonError("signal không hợp lệ", 400);

    const db = getDb();
    if (signal === "block") {
      await db
        .update(youtubeTracks)
        .set({ blocked: true })
        .where(eq(youtubeTracks.videoId, videoId));
    }

    // Chặn nhúng cũng tính là một lần bỏ qua: người nghe không được nghe bài này.
    const skips = signal === "finish" ? 0 : 1;
    const finishes = signal === "finish" ? 1 : 0;

    const rows: Array<typeof radioFeedback.$inferInsert> = [
      { userId, subject: "video", subjectKey: videoId, skips, finishes },
    ];
    const artistKey = normalizeKey(body.artistName);
    if (artistKey) {
      rows.push({
        userId,
        subject: "artist",
        subjectKey: artistKey,
        skips,
        finishes,
      });
    }

    await db
      .insert(radioFeedback)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          radioFeedback.userId,
          radioFeedback.subject,
          radioFeedback.subjectKey,
        ],
        set: {
          skips: sql`${radioFeedback.skips} + ${skips}`,
          finishes: sql`${radioFeedback.finishes} + ${finishes}`,
          updatedAt: new Date(),
        },
      });

    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
