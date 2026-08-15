import { readErrorBody } from "@/lib/providers";
import { YoutubeReauthError } from "@/lib/youtube/account";
import { LANGUAGE_CODE, REGION_CODE } from "@/lib/youtube/locale";
import { parseIso8601Duration } from "@vong/shared";

/**
 * Lớp gọi YouTube Data API v3 (chỉ chạy phía server).
 *
 * Credential: `YOUTUBE_API_KEY` dùng chung, HOẶC access token của user — Data API
 * nhận một trong hai, nên app chạy được radio khi chỉ có liên kết YouTube.
 *
 * Quota mỗi project: 100 lần `search.list`/ngày (bucket riêng) + 10.000 unit/ngày
 * cho các endpoint còn lại (`playlistItems.list`, `videos.list` = 1 unit/lần).
 * Trần chặt là số lần search, nên mọi hàm ở đây đều được gọi qua cache của tầng
 * trên — đừng gọi trực tiếp trong vòng lặp render.
 */

const API = "https://www.googleapis.com/youtube/v3";

/** Category "Music" — lọc bỏ podcast, gameplay, vlog lọt vào kết quả tìm kiếm. */
export const MUSIC_CATEGORY_ID = "10";

/** YouTube chỉ nhận tối đa 50 id mỗi lần gọi videos.list / playlistItems.list. */
const MAX_IDS_PER_CALL = 50;

/**
 * Không có credential nào: chưa có `YOUTUBE_API_KEY` mà user cũng chưa nối tài
 * khoản YouTube → route trả 503 và UI ẩn nút Radio.
 */
export class YoutubeNotConfiguredError extends Error {}

/** Hết quota trong ngày (403 + reason quotaExceeded). */
export class YoutubeQuotaError extends Error {}

export class YoutubeApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

interface ErrorBody {
  error?: { errors?: Array<{ reason?: string }> };
}

interface PageInfo {
  nextPageToken?: string;
}

interface SearchResponse extends PageInfo {
  items?: Array<{
    id?: { videoId?: string; playlistId?: string };
    snippet?: { title?: string };
  }>;
}

interface VideoListResponse extends PageInfo {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      categoryId?: string;
      liveBroadcastContent?: string;
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
  }>;
}

interface PlaylistItemsResponse extends PageInfo {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
}

interface ChannelListResponse {
  items?: Array<{ id: string; snippet?: { title?: string } }>;
}

interface SubscriptionListResponse extends PageInfo {
  items?: Array<{
    snippet?: { title?: string; resourceId?: { channelId?: string } };
  }>;
}

interface PlaylistListResponse extends PageInfo {
  items?: Array<{ id: string; snippet?: { title?: string } }>;
}

/**
 * Gọi một endpoint của Data API.
 *
 * "Every request must either specify an API key (with the `key` parameter) or
 * provide an OAuth 2.0 token" (developers.google.com/youtube/v3/docs) — nên token
 * của user là đủ, không cần key. Google bỏ qua `key` khi request đã mang token,
 * nhưng vẫn chỉ gửi một thứ cho rõ ràng: có token thì KHÔNG gửi `key`.
 */
async function call<T>(
  path: string,
  params: Record<string, string>,
  accessToken?: string,
): Promise<T> {
  const query = new URLSearchParams(params);
  if (!accessToken) {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      throw new YoutubeNotConfiguredError(
        "Chưa có YOUTUBE_API_KEY và chưa nối tài khoản YouTube",
      );
    }
    query.set("key", key);
  }

  const url = `${API}${path}?${query}`;
  const res = await fetch(url, {
    // Kết quả gắn với quota và token của từng user → không để Next cache lại.
    cache: "no-store",
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });
  if (res.ok) return (await res.json()) as T;

  const body = await readErrorBody(res);
  if (res.status === 403) {
    let quotaExceeded = false;
    try {
      const parsed = JSON.parse(body) as ErrorBody;
      quotaExceeded =
        parsed.error?.errors?.some((item) => item.reason === "quotaExceeded") ??
        false;
    } catch {
      quotaExceeded = false;
    }
    if (quotaExceeded) {
      throw new YoutubeQuotaError("Hết quota YouTube Data API trong ngày");
    }
  }
  if (res.status === 401 && accessToken) {
    throw new YoutubeReauthError("Liên kết YouTube cần được cấp quyền lại");
  }
  throw new YoutubeApiError(
    res.status,
    `[youtube] ${res.status} khi gọi ${path}: ${body.slice(0, 400)}`,
  );
}

function toVideos(response: VideoListResponse): YoutubeVideo[] {
  const videos: YoutubeVideo[] = [];
  for (const item of response.items ?? []) {
    videos.push({
      videoId: item.id,
      rawTitle: item.snippet?.title ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      categoryId: item.snippet?.categoryId ?? "",
      durationSec: parseIso8601Duration(item.contentDetails?.duration ?? ""),
      // Thiếu `status.embeddable` thì coi như không nhúng được, an toàn hơn là đoán.
      embeddable: item.status?.embeddable === true,
      isLive: (item.snippet?.liveBroadcastContent ?? "none") !== "none",
    });
  }
  return videos;
}

/** Dùng chung cho bản có/không có OAuth: playlist riêng tư chỉ đọc được bằng token. */
async function playlistVideoIds(
  playlistId: string,
  limit: number,
  accessToken?: string,
): Promise<string[]> {
  const params = {
    part: "contentDetails",
    playlistId,
    maxResults: String(Math.min(limit, MAX_IDS_PER_CALL)),
  };
  try {
    const page = await call<PlaylistItemsResponse>(
      "/playlistItems",
      params,
      accessToken,
    );
    const ids: string[] = [];
    for (const item of page.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    return ids;
  } catch (error) {
    // Playlist bị xoá hoặc chuyển sang riêng tư sau khi search trả về.
    if (error instanceof YoutubeApiError && error.status === 404) return [];
    throw error;
  }
}

/**
 * `search.list` nằm ở bucket quota riêng: mặc định 100 lần/ngày, mỗi lần 1 quota
 * (developers.google.com/youtube/v3/determine_quota_cost). Đó là trần thật của
 * radio, nên ứng viên phải được cache lại theo seed.
 *
 * Chỉ trả playlist do người dùng tạo — mix `RD…` không đọc được qua API.
 */
export async function searchPlaylists(
  query: string,
  limit: number,
  accessToken?: string,
): Promise<Array<{ playlistId: string; title: string }>> {
  const page = await call<SearchResponse>(
    "/search",
    {
      part: "snippet",
      type: "playlist",
      q: query,
      maxResults: String(limit),
      regionCode: REGION_CODE,
      relevanceLanguage: LANGUAGE_CODE,
      safeSearch: "none",
    },
    accessToken,
  );

  const playlists: Array<{ playlistId: string; title: string }> = [];
  for (const item of page.items ?? []) {
    if (!item.id?.playlistId) continue;
    playlists.push({
      playlistId: item.id.playlistId,
      title: item.snippet?.title ?? "",
    });
  }
  return playlists;
}

/** Cùng bucket `search.list`. Nhánh dự phòng khi không tìm được playlist mix nào. */
export async function searchMusicVideos(
  query: string,
  limit: number,
  accessToken?: string,
): Promise<string[]> {
  const page = await call<SearchResponse>(
    "/search",
    {
      part: "snippet",
      type: "video",
      q: query,
      maxResults: String(limit),
      videoCategoryId: MUSIC_CATEGORY_ID,
      videoEmbeddable: "true",
      videoSyndicated: "true",
      order: "relevance",
      regionCode: REGION_CODE,
      relevanceLanguage: LANGUAGE_CODE,
      safeSearch: "none",
    },
    accessToken,
  );

  const ids: string[] = [];
  for (const item of page.items ?? []) {
    if (item.id?.videoId) ids.push(item.id.videoId);
  }
  return ids;
}

/** 1 unit. Playlist không còn tồn tại → trả []. */
export async function listPlaylistVideoIds(
  playlistId: string,
  limit: number,
  accessToken?: string,
): Promise<string[]> {
  return playlistVideoIds(playlistId, limit, accessToken);
}

export interface YoutubeVideo {
  videoId: string;
  rawTitle: string;
  channelTitle: string;
  categoryId: string;
  durationSec: number;
  embeddable: boolean;
  isLive: boolean;
}

/** 1 unit mỗi 50 id. Video bị xoá/riêng tư đơn giản là không có trong kết quả. */
export async function listVideos(
  ids: string[],
  accessToken?: string,
): Promise<YoutubeVideo[]> {
  const videos: YoutubeVideo[] = [];
  for (let start = 0; start < ids.length; start += MAX_IDS_PER_CALL) {
    const chunk = ids.slice(start, start + MAX_IDS_PER_CALL);
    const page = await call<VideoListResponse>(
      "/videos",
      {
        part: "snippet,contentDetails,status",
        id: chunk.join(","),
        maxResults: String(MAX_IDS_PER_CALL),
      },
      accessToken,
    );
    videos.push(...toVideos(page));
  }
  return videos;
}

/**
 * Bảng "nhạc đang thịnh hành" theo vùng — 1 unit mỗi lần gọi. `chart=mostPopular`
 * là endpoint duy nhất còn trả bảng xếp hạng: InnerTube `FEmusic_charts` trả 0
 * video (đã đo), còn `youtubei.js` không parse nó.
 */
export async function listTrendingMusic(
  regionCode: string,
  limit: number,
  accessToken?: string,
): Promise<YoutubeVideo[]> {
  const page = await call<VideoListResponse>(
    "/videos",
    {
      part: "snippet,contentDetails,status",
      chart: "mostPopular",
      videoCategoryId: MUSIC_CATEGORY_ID,
      regionCode,
      maxResults: String(Math.min(limit, MAX_IDS_PER_CALL)),
    },
    accessToken,
  );
  return toVideos(page);
}

/* ------------------------------------------------------------------ */
/* Gọi bằng OAuth token của user (phục vụ gu nhạc)                     */
/* ------------------------------------------------------------------ */

export async function getOwnChannel(
  accessToken: string,
): Promise<{ channelId: string; channelTitle: string }> {
  const page = await call<ChannelListResponse>(
    "/channels",
    { part: "snippet", mine: "true" },
    accessToken,
  );
  const channel = page.items?.[0];
  if (!channel) {
    throw new YoutubeApiError(404, "Tài khoản Google này chưa có kênh YouTube");
  }
  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title ?? "Kênh YouTube",
  };
}

/** 1 unit mỗi trang. `activities.list` không còn trả likes từ 2016 nên phải dùng myRating. */
export async function listLikedVideos(
  accessToken: string,
  maxPages: number,
): Promise<YoutubeVideo[]> {
  const videos: YoutubeVideo[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await call<VideoListResponse>(
      "/videos",
      {
        part: "snippet,contentDetails,status",
        myRating: "like",
        maxResults: String(MAX_IDS_PER_CALL),
        ...(pageToken ? { pageToken } : {}),
      },
      accessToken,
    );
    videos.push(...toVideos(response));
    pageToken = response.nextPageToken;
    if (!pageToken) break;
  }
  return videos;
}

export async function listSubscriptions(
  accessToken: string,
  maxPages: number,
): Promise<Array<{ channelId: string; channelTitle: string }>> {
  const channels: Array<{ channelId: string; channelTitle: string }> = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await call<SubscriptionListResponse>(
      "/subscriptions",
      {
        part: "snippet",
        mine: "true",
        maxResults: String(MAX_IDS_PER_CALL),
        ...(pageToken ? { pageToken } : {}),
      },
      accessToken,
    );
    for (const item of response.items ?? []) {
      const channelId = item.snippet?.resourceId?.channelId;
      if (!channelId) continue;
      channels.push({ channelId, channelTitle: item.snippet?.title ?? "" });
    }
    pageToken = response.nextPageToken;
    if (!pageToken) break;
  }
  return channels;
}

export async function listOwnPlaylists(
  accessToken: string,
): Promise<Array<{ playlistId: string; title: string }>> {
  const response = await call<PlaylistListResponse>(
    "/playlists",
    { part: "snippet", mine: "true", maxResults: "25" },
    accessToken,
  );

  const playlists: Array<{ playlistId: string; title: string }> = [];
  for (const item of response.items ?? []) {
    playlists.push({ playlistId: item.id, title: item.snippet?.title ?? "" });
  }
  return playlists;
}

/** Playlist riêng tư của user chỉ đọc được khi gửi Bearer token. */
export async function listPlaylistVideoIdsAuthed(
  accessToken: string,
  playlistId: string,
  limit: number,
): Promise<string[]> {
  return playlistVideoIds(playlistId, limit, accessToken);
}
