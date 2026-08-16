/**
 * Trộn kết quả tìm kiếm từ hai nguồn (YT Music catalog + YouTube thường).
 *
 * Tách riêng khỏi `music.ts` để KHÔNG kéo `youtubei.js` vào: đây là logic thuần,
 * cần test kỹ mà không phải giả lập cả InnerTube.
 */

/** Bất cứ hit nào có `videoId` để bỏ trùng. */
export interface HasVideoId {
  videoId: string;
}

/**
 * Xen kẽ luân phiên hai danh sách rồi bỏ trùng theo `videoId`, cắt còn `limit`.
 *
 * Xen kẽ (a[0], b[0], a[1], b[1], …) thay vì nối đuôi (a rồi b): nếu đổ hết nguồn
 * `a` trước, một từ khoá mà nguồn `a` có sẵn nhiều sẽ đẩy toàn bộ nguồn `b` ra khỏi
 * trang — đúng thứ người dùng thấy thiếu. Xen kẽ để cả hai nguồn luôn có mặt, phần
 * tử của `a` (metadata sạch hơn) vẫn đứng trước ở mỗi cặp.
 */
export function interleaveHits<T extends HasVideoId>(
  a: readonly T[],
  b: readonly T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  const rounds = Math.max(a.length, b.length);
  for (let i = 0; i < rounds && merged.length < limit; i++) {
    for (const hit of [a[i], b[i]]) {
      if (!hit || merged.length >= limit || seen.has(hit.videoId)) continue;
      seen.add(hit.videoId);
      merged.push(hit);
    }
  }
  return merged;
}
