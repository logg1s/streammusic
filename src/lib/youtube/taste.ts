import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  youtubeAccounts,
  youtubeTasteArtists,
  youtubeTasteVideos,
} from "@/db/schema";
import {
  listLikedVideos,
  listOwnPlaylists,
  listPlaylistVideoIdsAuthed,
  listSubscriptions,
  listVideos,
  MUSIC_CATEGORY_ID,
  type YoutubeVideo,
} from "@/lib/youtube/api";
import {
  getYoutubeAccessToken,
  getYoutubeAccount,
  markYoutubeNeedsReauth,
  refreshYoutubeAccessToken,
  YoutubeReauthError,
} from "@/lib/youtube/account";
import { channelArtistName, normalizeKey, splitArtistTitle } from "@vong/shared";
import { upsertYoutubeTracks, type YoutubeTrackInput } from "@/lib/youtube/store";

/**
 * Gu nhạc lấy từ chính tài khoản YouTube của user.
 *
 * Cả lượt đồng bộ tốn khoảng 20 unit quota, nên chỉ chạy lại khi đã cũ hơn
 * TASTE_TTL_MS hoặc khi user tự bấm đồng bộ ở trang Cài đặt.
 */

const MAX_LIKE_PAGES = 4; // ≤200 video đã thích, 4 unit
const MAX_SUB_PAGES = 2; // ≤100 kênh, 2 unit
const MAX_OWN_PLAYLISTS = 5; // 5 unit playlistItems + ≤5 unit videos.list
const TASTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WEIGHT_SUBSCRIPTION = 3;
const WEIGHT_LIKED = 2;
const WEIGHT_OWN_PLAYLIST = 1;
const MAX_ARTIST_WEIGHT = 10; // một nghệ sĩ không được đè cả gu

/** Playlist hệ thống, không phản ánh gu nghe nhạc. */
const SKIP_PLAYLIST = /watch later|xem sau/i;

const PLAYLIST_ITEM_LIMIT = 50;

export interface TasteProfile {
  /** key = artistKey (đã normalizeKey) */
  artists: Map<string, { weight: number; label: string }>;
  videoIds: Set<string>;
}

function toTrackRows(videos: YoutubeVideo[]): YoutubeTrackInput[] {
  const rows: YoutubeTrackInput[] = [];
  for (const video of videos) {
    const { artistName, title } = splitArtistTitle(
      video.rawTitle,
      video.channelTitle,
    );
    rows.push({
      videoId: video.videoId,
      title,
      artistName,
      channelTitle: video.channelTitle,
      durationSec: video.durationSec,
    });
  }
  return rows;
}

async function rememberTasteVideos(
  userId: string,
  videoIds: string[],
  source: "liked" | "own_playlist",
): Promise<void> {
  const unique = [...new Set(videoIds)];
  if (unique.length === 0) return;
  await getDb()
    .insert(youtubeTasteVideos)
    .values(unique.map((videoId) => ({ userId, videoId, source })))
    // Video đã thích mà cũng nằm trong playlist riêng: giữ tín hiệu mạnh hơn ("liked").
    .onConflictDoNothing();
}

/**
 * Đọc video đã thích, kênh đã đăng ký và playlist riêng → ghi lại thành gu nhạc.
 *
 * Google từ chối access token đang lưu (401) thì xin token mới rồi thử đúng một
 * lần nữa: hạn ghi trong DB có thể sai, hoặc riêng access token bị thu hồi. Vẫn
 * bị từ chối thì đánh dấu `needs_reauth` để UI mời cấp quyền lại.
 */
export async function syncYoutubeTaste(
  userId: string,
  accessToken: string,
): Promise<{ liked: number; subscriptions: number; artists: number }> {
  try {
    return await collectTaste(userId, accessToken);
  } catch (error) {
    if (!(error instanceof YoutubeReauthError)) throw error;
    const fresh = await refreshYoutubeAccessToken(userId);
    if (!fresh) throw error;
    try {
      return await collectTaste(userId, fresh);
    } catch (retryError) {
      if (retryError instanceof YoutubeReauthError) {
        await markYoutubeNeedsReauth(userId);
      }
      throw retryError;
    }
  }
}

/**
 * Bảng nghệ sĩ được ghi đè trọn vẹn nên chạy lại nhiều lần cho ra cùng kết quả,
 * không cộng dồn trùng. Gặp `YoutubeQuotaError` giữa đường thì ném lên: phần đã
 * ghi vẫn dùng được và lần sau đồng bộ lại đầy đủ.
 */
async function collectTaste(
  userId: string,
  accessToken: string,
): Promise<{ liked: number; subscriptions: number; artists: number }> {
  const db = getDb();
  const weights = new Map<string, { weight: number; label: string }>();

  const addWeight = (artistKey: string, label: string, amount: number) => {
    if (!artistKey) return;
    const current = weights.get(artistKey);
    weights.set(artistKey, {
      label: current?.label ?? label,
      weight: Math.min(MAX_ARTIST_WEIGHT, (current?.weight ?? 0) + amount),
    });
  };

  // 1. Video đã thích — chỉ giữ mục Nhạc, phần còn lại (vlog, gameplay) không phải gu nhạc.
  const liked = (await listLikedVideos(accessToken, MAX_LIKE_PAGES)).filter(
    (video) => video.categoryId === MUSIC_CATEGORY_ID,
  );
  const likedRows = toTrackRows(liked);
  await upsertYoutubeTracks(likedRows);
  await rememberTasteVideos(
    userId,
    likedRows.map((row) => row.videoId),
    "liked",
  );
  for (const row of likedRows) {
    addWeight(normalizeKey(row.artistName), row.artistName ?? "", WEIGHT_LIKED);
  }

  // 2. Kênh đã đăng ký — tín hiệu mạnh nhất, hiện tên kênh gốc lên UI.
  const subscriptions = await listSubscriptions(accessToken, MAX_SUB_PAGES);
  for (const channel of subscriptions) {
    addWeight(
      normalizeKey(channelArtistName(channel.channelTitle)),
      channel.channelTitle,
      WEIGHT_SUBSCRIPTION,
    );
  }

  // 3. Playlist riêng của user.
  const ownPlaylists = (await listOwnPlaylists(accessToken))
    .filter((playlist) => !SKIP_PLAYLIST.test(playlist.title))
    .slice(0, MAX_OWN_PLAYLISTS);
  for (const playlist of ownPlaylists) {
    const ids = await listPlaylistVideoIdsAuthed(
      accessToken,
      playlist.playlistId,
      PLAYLIST_ITEM_LIMIT,
    );
    if (ids.length === 0) continue;
    const videos = (await listVideos(ids)).filter(
      (video) => video.categoryId === MUSIC_CATEGORY_ID,
    );
    const rows = toTrackRows(videos);
    await upsertYoutubeTracks(rows);
    await rememberTasteVideos(
      userId,
      rows.map((row) => row.videoId),
      "own_playlist",
    );
    for (const row of rows) {
      addWeight(
        normalizeKey(row.artistName),
        row.artistName ?? "",
        WEIGHT_OWN_PLAYLIST,
      );
    }
  }

  // 4. Ghi lại nguyên khối để lần đồng bộ sau không cộng dồn lên số cũ.
  const artistRows = [...weights].map(([artistKey, entry]) => ({
    userId,
    artistKey,
    label: entry.label || artistKey,
    weight: entry.weight,
  }));
  await db
    .delete(youtubeTasteArtists)
    .where(eq(youtubeTasteArtists.userId, userId));
  if (artistRows.length > 0) {
    await db.insert(youtubeTasteArtists).values(artistRows);
  }

  // 5. Đánh dấu đã đồng bộ để refreshTasteIfStale biết lúc nào cần chạy lại.
  await db
    .update(youtubeAccounts)
    .set({ tasteSyncedAt: new Date() })
    .where(eq(youtubeAccounts.userId, userId));

  return {
    liked: likedRows.length,
    subscriptions: subscriptions.length,
    artists: artistRows.length,
  };
}

/** Gu đã lưu; rỗng khi chưa nối tài khoản (radio chạy chế độ không cá nhân hoá). */
export async function loadTasteProfile(userId: string): Promise<TasteProfile> {
  const db = getDb();
  const [artistRows, videoRows] = await Promise.all([
    db
      .select({
        artistKey: youtubeTasteArtists.artistKey,
        label: youtubeTasteArtists.label,
        weight: youtubeTasteArtists.weight,
      })
      .from(youtubeTasteArtists)
      .where(eq(youtubeTasteArtists.userId, userId)),
    db
      .select({ videoId: youtubeTasteVideos.videoId })
      .from(youtubeTasteVideos)
      .where(eq(youtubeTasteVideos.userId, userId)),
  ]);

  const artists = new Map<string, { weight: number; label: string }>();
  for (const row of artistRows) {
    artists.set(row.artistKey, { weight: row.weight, label: row.label });
  }
  return { artists, videoIds: new Set(videoRows.map((row) => row.videoId)) };
}

/** Đồng bộ lại khi gu đã cũ. Mọi lỗi bị nuốt để radio không chết theo. */
export async function refreshTasteIfStale(userId: string): Promise<void> {
  try {
    const account = await getYoutubeAccount(userId);
    if (!account) return;
    if (
      account.tasteSyncedAt &&
      Date.now() - account.tasteSyncedAt.getTime() < TASTE_TTL_MS
    ) {
      return;
    }
    const accessToken = await getYoutubeAccessToken(userId);
    if (!accessToken) return;
    await syncYoutubeTaste(userId, accessToken);
  } catch (error) {
    console.warn("Không đồng bộ được gu YouTube", error);
  }
}
