import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, tracks, type Connection } from "@/db/schema";
import { isUuid } from "@/lib/library";

/**
 * Nạp mọi thứ endpoint stream cần, trong MỘT truy vấn, có cache ngắn hạn.
 *
 * Lý do tồn tại: mỗi lần phát một lô byte, route cũ chạy hai lượt select tuần tự
 * (track rồi connection). Đo được mỗi lượt tới Neon mất ~285ms, tức là ~570ms
 * chi phí cố định trước cả khi chạm tới Google Drive. Nhân với số lô của một bài
 * thì đó là vài giây lãng phí cho mỗi lần nghe.
 */

export interface StreamSource {
  track: {
    id: string;
    remoteId: string;
    mimeType: string | null;
    sizeBytes: number | null;
    streamUrlCache: string | null;
    streamUrlExpiresAt: Date | null;
  };
  connection: Connection;
}

/**
 * Cache nằm trong RAM của từng instance nên KHÔNG đảm bảo trúng — Vercel có thể
 * dựng instance mới bất cứ lúc nào. Đây thuần tuý là tối ưu; mọi đường đi vẫn
 * phải đúng khi cache trượt.
 */
const TTL_MS = 60_000;
const MAX_ENTRIES = 200;

const cache = new Map<string, { value: StreamSource; expiresAt: number }>();

function cacheKey(userId: string, trackId: string) {
  return `${userId}:${trackId}`;
}

export function invalidateStreamSource(userId: string, trackId: string) {
  cache.delete(cacheKey(userId, trackId));
}

export async function loadStreamSource(
  userId: string,
  trackId: string,
): Promise<StreamSource | null> {
  // Id bài YouTube (`yt:<videoId>`) không phải uuid: để nguyên thì Postgres ném lỗi cast
  // và route trả 500 thay vì 404. Bài YouTube không đi qua `/api/stream` bao giờ.
  if (!isUuid(trackId)) return null;
  const key = cacheKey(userId, trackId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  if (hit) cache.delete(key);

  const [row] = await getDb()
    .select({
      id: tracks.id,
      remoteId: tracks.remoteId,
      mimeType: tracks.mimeType,
      sizeBytes: tracks.sizeBytes,
      streamUrlCache: tracks.streamUrlCache,
      streamUrlExpiresAt: tracks.streamUrlExpiresAt,
      connection: connections,
    })
    .from(tracks)
    .innerJoin(connections, eq(tracks.connectionId, connections.id))
    // Chốt chặn bảo mật vẫn nằm ở đây: chỉ lấy track của chính user đang đăng nhập.
    .where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)))
    .limit(1);

  if (!row) return null;

  const value: StreamSource = {
    track: {
      id: row.id,
      remoteId: row.remoteId,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      streamUrlCache: row.streamUrlCache,
      streamUrlExpiresAt: row.streamUrlExpiresAt,
    },
    connection: row.connection,
  };

  // Xoá mục cũ nhất khi đầy — Map giữ đúng thứ tự chèn nên key đầu tiên là cũ nhất.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });

  return value;
}

/** Ghi lại link tạm thời vừa xin được, cập nhật luôn bản trong cache. */
export function rememberStreamUrl(
  userId: string,
  source: StreamSource,
  url: string,
  expiresAt: Date,
) {
  source.track.streamUrlCache = url;
  source.track.streamUrlExpiresAt = expiresAt;
  const entry = cache.get(cacheKey(userId, source.track.id));
  if (entry) entry.value = source;
}
