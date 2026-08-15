import { Innertube, YTNodes } from "youtubei.js";
import type { PlayableTrack } from "@/lib/library";
import {
  LONG_FORM,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  splitArtistTitle,
} from "@/lib/youtube/parse";
import { LANGUAGE_CODE, REGION_CODE } from "@/lib/youtube/locale";
import { innertube } from "@/lib/youtube/resolve";
import { upsertYoutubeTracks } from "@/lib/youtube/store";
import { toPlayableTrack } from "@/lib/youtube/track";

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

/** Tìm bài trên YouTube Music. Kết quả đã là "bài hát", không phải video bất kỳ. */
export async function searchSongs(
  query: string,
  limit: number,
): Promise<MusicHit[]> {
  const yt = await innertube();
  const search = await yt.music.search(query, { type: "song" });
  const hits: MusicHit[] = [];

  for (const item of search.songs?.contents ?? []) {
    const node = item.as(YTNodes.MusicResponsiveListItem);
    const hit = fromListItem(node);
    if (hit) hits.push(hit);
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Hàng đợi automix của YouTube cho một bài — nguồn ứng viên chính của radio.
 * `automix: true` là thứ khiến YouTube tự nối thêm bài sau danh sách gốc.
 */
export async function upNextQueue(
  videoId: string,
  limit: number,
): Promise<{ playlistId: string | null; hits: MusicHit[] }> {
  const yt = await innertube();
  const panel = await yt.music.getUpNext(videoId, true);
  const hits: MusicHit[] = [];

  for (const node of panel.contents) {
    // AutomixPreviewVideo chỉ là chỗ giữ ("sẽ tự phát tiếp"), không phải một bài.
    if (!node.is(YTNodes.PlaylistPanelVideo)) continue;
    const item = node.as(YTNodes.PlaylistPanelVideo);
    if (!item.video_id || item.video_id === videoId) continue;
    hits.push({
      videoId: item.video_id,
      rawTitle: item.title.toString(),
      channelTitle: item.artists?.[0]?.name ?? item.author ?? "",
      durationSec: item.duration?.seconds ?? null,
    });
    if (hits.length >= limit) break;
  }

  return { playlistId: panel.playlist_id || null, hits };
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
