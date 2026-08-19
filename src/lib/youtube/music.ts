import {
  type Helpers,
  Innertube,
  PlaylistPanelContinuation,
  YTNodes,
} from "youtubei.js";
import type { PlayableTrack } from "@vong/shared";
import {
  LONG_FORM,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  splitArtistTitle,
} from "@vong/shared";
import { LANGUAGE_CODE, REGION_CODE } from "@/lib/youtube/locale";
import { interleaveHits } from "@/lib/youtube/merge";
import { innertube } from "@/lib/youtube/resolve";
import { upsertYoutubeTracks } from "@/lib/youtube/store";
import { toPlayableTrack } from "@vong/shared";

/**
 * Các mặt của YouTube Music qua InnerTube (chỉ chạy phía server).
 *
 * Không tốn quota Data API: đây là API nội bộ mà chính ứng dụng YouTube Music dùng.
 * Đổi lại nó có thể vỡ khi Google đổi giao thức, nên lỗi được để nổi lên cho nơi gọi
 * quyết định (radio lùi sang nguồn khác, route trả lỗi) — chỉ những vòng lặp có thể
 * mất một phần kết quả mới tự cô lập tại chỗ.
 *
 * `search.list` của Data API chỉ còn 100 lần/ngày cho cả project, nên tìm kiếm và
 * automix ĐỀU đi qua đây; Data API chỉ còn lo trending (endpoint InnerTube tương
 * ứng trả 0 kết quả).
 */

/** Một bài lấy từ YouTube, chưa qua bộ lọc rác. */
export interface MusicHit {
  videoId: string;
  rawTitle: string;
  channelTitle: string;
  durationSec: number | null;
}

/** Hàng gợi ý trên trang chủ YouTube Music. */
export interface MusicSection {
  title: string;
  hits: MusicHit[];
}

/**
 * Phiên đọc feed cá nhân hoá. TÁCH HẲN khỏi phiên resolve: cookie sẽ loại bỏ
 * `ANDROID_VR`/`VISIONOS` và đẩy resolve sang `web` (DRM + SABR + PO token).
 * Không có `YT_MUSIC_COOKIE` thì dùng luôn phiên khách.
 */
let cachedFeed: Innertube | null = null;

async function feedSession(): Promise<Innertube> {
  const cookie = process.env.YT_MUSIC_COOKIE;
  if (!cookie) return innertube();
  if (cachedFeed) return cachedFeed;
  cachedFeed = await Innertube.create({
    cookie,
    lang: LANGUAGE_CODE,
    location: REGION_CODE,
    retrieve_player: false,
  });
  return cachedFeed;
}

/** Node bài hát của YTMusic → MusicHit. Bỏ node không phải bài (album, nghệ sĩ…). */
function fromListItem(item: YTNodes.MusicResponsiveListItem): MusicHit | null {
  if (item.item_type !== "song" && item.item_type !== "video") return null;
  if (!item.id || !item.title) return null;
  return {
    videoId: item.id,
    rawTitle: item.title,
    // Playlist trending trả tên kênh ở `authors`, còn shelf bài hát ở `artists`.
    channelTitle:
      item.artists?.[0]?.name ??
      item.authors?.[0]?.name ??
      item.author?.name ??
      "",
    durationSec: item.duration?.seconds ?? null,
  };
}

function fromTwoRowItem(item: YTNodes.MusicTwoRowItem): MusicHit | null {
  if (item.item_type !== "song" && item.item_type !== "video") return null;
  if (!item.id) return null;
  return {
    videoId: item.id,
    rawTitle: item.title.toString(),
    channelTitle: item.artists?.[0]?.name ?? item.author?.name ?? "",
    durationSec: null,
  };
}

/** Video của tìm kiếm YouTube thường → MusicHit. Bỏ live/sắp phát (không có byte để nghe). */
function fromVideo(item: YTNodes.Video): MusicHit | null {
  if (!item.video_id) return null;
  if (item.is_live || item.is_upcoming) return null;
  return {
    videoId: item.video_id,
    rawTitle: item.title.toString(),
    channelTitle: item.author?.name ?? "",
    // `duration.seconds` là 0 với video ẩn thời lượng; đổi thành null để persistHits
    // giữ lại thay vì loại theo khoảng thời lượng.
    durationSec: item.duration?.seconds || null,
  };
}

/**
 * Tìm bài trên YouTube Music. Kết quả đã là "bài hát", không phải video bất kỳ.
 *
 * KHÔNG dùng `search.songs`: getter đó của youtubei.js so tiêu đề kệ với đúng chuỗi
 * tiếng Anh `"Songs"`, nên với phiên `lang: "vi"` (kệ tên "Bài hát") nó luôn trả
 * `undefined` — đo được: mọi từ khoá đều ra 0 kết quả. Quét mọi kệ rồi lọc theo
 * `item_type` thay vì theo tên: `item_type` suy từ `musicVideoType`/`pageType` nên
 * không phụ thuộc ngôn ngữ, và item của kệ album/nghệ sĩ tự bị `fromListItem` loại.
 */
export async function searchSongs(
  query: string,
  limit: number,
): Promise<MusicHit[]> {
  const yt = await innertube();
  const search = await yt.music.search(query, { type: "song" });
  const hits: MusicHit[] = [];

  for (const shelf of search.contents?.filterType(YTNodes.MusicShelf) ?? []) {
    for (const item of shelf.contents) {
      const hit = fromListItem(item);
      if (hit) hits.push(hit);
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

/**
 * Tìm trên YouTube THƯỜNG (không phải YouTube Music). Đây là thứ khiến kết quả "giống
 * youtube.com": bản cover, live, lyric video, và rất nhiều nhạc Việt của kênh cá nhân
 * không nằm trong catalog "song" của YT Music. persistHits sau đó lọc rác/độ dài.
 */
export async function searchVideos(
  query: string,
  limit: number,
): Promise<MusicHit[]> {
  const yt = await innertube();
  const search = await yt.search(query, { type: "video" });
  const hits: MusicHit[] = [];

  for (const item of search.results?.filterType(YTNodes.Video) ?? []) {
    const hit = fromVideo(item);
    if (hit) hits.push(hit);
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Kết quả tìm kiếm hoàn chỉnh: catalog YT Music (metadata sạch, tách nghệ sĩ chuẩn) đứng
 * trước, rồi phủ thêm YouTube thường cho đủ rộng. Gộp và bỏ trùng theo videoId; persistHits
 * ở route lọc rác/độ dài lần cuối.
 *
 * Chạy hai nguồn song song: cả hai đều qua InnerTube nên không tốn quota Data API. Một
 * nguồn hỏng (Google đổi giao thức) không được kéo cả tìm kiếm sập — nên mỗi nguồn tự cô
 * lập lỗi, miễn nguồn kia còn trả bài.
 */
export async function searchTracks(
  query: string,
  limit: number,
): Promise<MusicHit[]> {
  const [songs, videos] = await Promise.all([
    searchSongs(query, limit).catch((error) => {
      console.warn("Tìm YT Music lỗi", error);
      return [] as MusicHit[];
    }),
    searchVideos(query, limit).catch((error) => {
      console.warn("Tìm YouTube thường lỗi", error);
      return [] as MusicHit[];
    }),
  ]);

  // Catalog (metadata sạch) đứng trước ở mỗi cặp, YouTube thường phủ rộng — xem
  // `interleaveHits`.
  return interleaveHits(songs, videos, limit);
}

/** Cụm từ YouTube Music gợi ý khi người dùng đang nhập ô tìm kiếm. */
export async function searchSuggestions(
  input: string,
  limit = 8,
): Promise<string[]> {
  const query = input.trim();
  if (!query) return [];
  const yt = await innertube();
  const sections = await yt.music.getSearchSuggestions(query);
  const suggestions: string[] = [];

  for (const section of sections) {
    for (const node of section.contents) {
      if (!node.is(YTNodes.SearchSuggestion)) continue;
      const value = node
        .as(YTNodes.SearchSuggestion)
        .suggestion.toString()
        .trim();
      if (!value || suggestions.includes(value)) continue;
      suggestions.push(value);
      if (suggestions.length >= limit) return suggestions;
    }
  }
  return suggestions;
}

/**
 * Hàng đợi automix của YouTube cho một bài — nguồn ứng viên chính của radio.
 * `automix: true` là thứ khiến YouTube tự nối thêm bài sau danh sách gốc.
 */
export async function upNextQueue(
  videoId: string,
  limit: number,
): Promise<{
  playlistId: string | null;
  continuation: string | null;
  hits: MusicHit[];
}> {
  const yt = await innertube();
  const panel = await yt.music.getUpNext(videoId, true);
  const hits = hitsFromPlaylistNodes(panel.contents, limit, videoId);

  return {
    playlistId: panel.playlist_id || null,
    continuation: panel.continuation || null,
    hits,
  };
}

/** Đọc một node panel thường hoặc wrapper mà YouTube dùng cho bản thay thế. */
function playlistVideoFromNode(
  node: YTNodes.PlaylistPanelVideo | YTNodes.PlaylistPanelVideoWrapper,
): YTNodes.PlaylistPanelVideo | null {
  if (node.is(YTNodes.PlaylistPanelVideo)) {
    return node.as(YTNodes.PlaylistPanelVideo);
  }
  if (node.is(YTNodes.PlaylistPanelVideoWrapper)) {
    return node.as(YTNodes.PlaylistPanelVideoWrapper).primary;
  }
  return null;
}

function hitsFromPlaylistNodes(
  nodes: Iterable<
    | Helpers.YTNode
    | YTNodes.PlaylistPanelVideo
    | YTNodes.PlaylistPanelVideoWrapper
  >,
  limit: number,
  seedVideoId?: string,
): MusicHit[] {
  const hits: MusicHit[] = [];

  for (const node of nodes) {
    // AutomixPreviewVideo chỉ là chỗ giữ ("sẽ tự phát tiếp"), không phải một bài.
    if (
      !node.is(YTNodes.PlaylistPanelVideo, YTNodes.PlaylistPanelVideoWrapper)
    ) {
      continue;
    }
    const item = playlistVideoFromNode(
      node.as(YTNodes.PlaylistPanelVideo, YTNodes.PlaylistPanelVideoWrapper),
    );
    if (!item?.video_id || item.video_id === seedVideoId) continue;
    hits.push({
      videoId: item.video_id,
      rawTitle: item.title.toString(),
      channelTitle: item.artists?.[0]?.name ?? item.author ?? "",
      durationSec: item.duration?.seconds ?? null,
    });
    if (hits.length >= limit) break;
  }

  return hits;
}

/**
 * Trang kế tiếp của đúng YouTube Mix đang phát. Token là opaque và chỉ được chuyển
 * nguyên vẹn về InnerTube; Vọng không tự xếp hạng hoặc gieo lại từ seed khác.
 */
export async function upNextContinuation(
  continuation: string,
  limit: number,
): Promise<{ continuation: string | null; hits: MusicHit[] }> {
  const yt = await innertube();
  const page = await yt.actions.execute("/next", {
    continuation,
    client: "YTMUSIC",
    parse: true,
  });
  const panel = page.continuation_contents?.is(PlaylistPanelContinuation)
    ? page.continuation_contents.as(PlaylistPanelContinuation)
    : null;
  if (!panel) return { continuation: null, hits: [] };

  return {
    continuation: panel.continuation || null,
    hits: hitsFromPlaylistNodes(panel.contents, limit),
  };
}

/** Nguồn ứng viên số 2 khi automix mỏng. */
export async function relatedSongs(
  videoId: string,
  limit: number,
): Promise<MusicHit[]> {
  const yt = await innertube();
  const related = await yt.music.getRelated(videoId);
  if (!related.is(YTNodes.SectionList)) return [];

  const hits: MusicHit[] = [];
  for (const section of related.as(YTNodes.SectionList).contents) {
    if (!section.is(YTNodes.MusicCarouselShelf)) continue;
    for (const item of section.as(YTNodes.MusicCarouselShelf).contents) {
      const hit = item.is(YTNodes.MusicResponsiveListItem)
        ? fromListItem(item.as(YTNodes.MusicResponsiveListItem))
        : item.is(YTNodes.MusicTwoRowItem)
          ? fromTwoRowItem(item.as(YTNodes.MusicTwoRowItem))
          : null;
      if (hit) hits.push(hit);
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

/** Mỗi hàng gợi ý lấy tối đa ngần này bài — đủ để cuộn ngang, không quá tay. */
const HITS_PER_SECTION = 20;

/**
 * Các hàng gợi ý trên trang chủ YouTube Music. Có `YT_MUSIC_COOKIE` thì cá nhân
 * hoá theo tài khoản đó; không thì là gợi ý chung theo vùng (đo được với phiên
 * khách VN: "Trending 20 Vietnam", "Top 100 Music Videos Vietnam"…).
 *
 * Trang chủ trả về các PLAYLIST chứ không phải bài lẻ, nên mỗi playlist được mở ra
 * thành một hàng riêng mang đúng tên của nó. Mỗi lần mở là một lời gọi InnerTube,
 * không tốn quota, và route gọi hàm này có cache 6 giờ.
 */
export async function homeSections(limit: number): Promise<MusicSection[]> {
  const yt = await feedSession();
  const home = await yt.music.getHomeFeed();

  const sections: MusicSection[] = [];
  const playlistIds: string[] = [];

  for (const section of home.sections ?? []) {
    // MusicTasteBuilderShelf là ô "cho biết bạn thích gì" khi phiên chưa có gu — bỏ.
    if (!section.is(YTNodes.MusicCarouselShelf)) continue;
    const shelf = section.as(YTNodes.MusicCarouselShelf);

    const hits: MusicHit[] = [];
    for (const item of shelf.contents) {
      if (item.is(YTNodes.MusicResponsiveListItem)) {
        const hit = fromListItem(item.as(YTNodes.MusicResponsiveListItem));
        if (hit) hits.push(hit);
        continue;
      }
      if (!item.is(YTNodes.MusicTwoRowItem)) continue;
      const node = item.as(YTNodes.MusicTwoRowItem);
      const hit = fromTwoRowItem(node);
      if (hit) hits.push(hit);
      else if (node.item_type === "playlist" && node.id)
        playlistIds.push(node.id);
    }

    // Shelf đã sẵn bài lẻ (phiên có cookie hay gợi ý theo bài vừa nghe) thì dùng luôn.
    if (hits.length > 0) {
      sections.push({
        title: shelf.header?.title?.toString() ?? "Gợi ý",
        hits: hits.slice(0, HITS_PER_SECTION),
      });
    }
  }

  for (const playlistId of playlistIds) {
    if (sections.length >= limit) break;

    // Playlist bị gỡ / chặn vùng làm cả hàng gợi ý mất trắng nếu không cô lập ở đây.
    let playlist;
    try {
      playlist = await yt.music.getPlaylist(playlistId);
    } catch (error) {
      console.warn(`Không mở được playlist YouTube ${playlistId}`, error);
      continue;
    }

    const hits: MusicHit[] = [];
    for (const item of playlist.contents ?? []) {
      if (!item.is(YTNodes.MusicResponsiveListItem)) continue;
      const hit = fromListItem(item.as(YTNodes.MusicResponsiveListItem));
      if (hit) hits.push(hit);
      if (hits.length >= HITS_PER_SECTION) break;
    }
    if (hits.length === 0) continue;

    // Ba kiểu header khác nhau; chỉ hai kiểu đầu có `title` nên phải hẹp lại.
    const header = playlist.header;
    const title =
      header?.is(YTNodes.MusicResponsiveHeader, YTNodes.MusicDetailHeader) ===
      true
        ? header.title.toString()
        : "Gợi ý";
    sections.push({ title, hits });
  }

  return sections.slice(0, limit);
}

/**
 * Lọc rác, tách tên nghệ sĩ, ghi vào bộ đệm `youtube_tracks`, trả PlayableTrack.
 * Mọi nguồn mới đều phải đi qua đây — parser tên đã hiệu chỉnh qua 15 ca thật.
 */
export async function persistHits(hits: MusicHit[]): Promise<PlayableTrack[]> {
  const seen = new Set<string>();
  const rows = [];

  for (const hit of hits) {
    if (seen.has(hit.videoId)) continue;
    if (LONG_FORM.test(hit.rawTitle)) continue;
    // durationSec null nghĩa là nguồn không cho biết (trang chủ) — vẫn nhận, còn
    // biết mà lệch khoảng thì loại.
    if (
      hit.durationSec !== null &&
      (hit.durationSec < MIN_DURATION_SEC || hit.durationSec > MAX_DURATION_SEC)
    ) {
      continue;
    }
    seen.add(hit.videoId);

    const { artistName, title } = splitArtistTitle(
      hit.rawTitle,
      hit.channelTitle,
    );
    rows.push({
      videoId: hit.videoId,
      title,
      artistName,
      channelTitle: hit.channelTitle,
      durationSec: hit.durationSec,
    });
  }

  if (rows.length === 0) return [];
  await upsertYoutubeTracks(rows);
  return rows.map(toPlayableTrack);
}
