import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  artists,
  playEvents,
  radioFeedback,
  radioSeeds,
  tracks,
  youtubeTasteVideos,
  youtubeTracks,
} from "@/db/schema";
import type { PlayableTrack } from "@vong/shared";
import { getTrackById } from "@/lib/library";
import {
  getYoutubeAccessToken,
  markYoutubeNeedsReauth,
  refreshYoutubeAccessToken,
  YoutubeReauthError,
} from "@/lib/youtube/account";
import {
  listPlaylistVideoIds,
  listVideos,
  MUSIC_CATEGORY_ID,
  searchMusicVideos,
  searchPlaylists,
} from "@/lib/youtube/api";
import {
  type MusicHit,
  persistHits,
  relatedSongs,
  upNextQueue,
} from "@/lib/youtube/music";
import {
  LONG_FORM,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  normalizeKey,
  PLAYLIST_JUNK,
  sameArtistKey,
  splitArtistTitle,
} from "@vong/shared";
import { upsertYoutubeTracks } from "@/lib/youtube/store";
import {
  loadTasteProfile,
  refreshTasteIfStale,
  type TasteProfile,
} from "@/lib/youtube/taste";
import { parseYoutubeTrackId, toPlayableTrack } from "@vong/shared";

/**
 * Automix của YouTube Music không tốn quota, nên cache chỉ cần đủ để một phiên
 * nghe không gọi lại liên tục — hết 24 giờ thì đào lại cho gợi ý tươi hơn. Nhánh
 * Data API dự phòng vẫn hưởng chung cache này.
 */
const CANDIDATE_TTL_MS = 24 * 60 * 60 * 1000;
/** Dưới ngưỡng này thì ứng viên quá mỏng — bù bằng nguồn kế tiếp. */
const MIN_CANDIDATES = 20;
const MAX_CANDIDATES = 100;
/**
 * Chặn một nghệ sĩ chiếm cả lô, radio nghe mới ra "radio".
 *
 * Nghệ sĩ của bài gốc được nới rộng hơn: bấm Radio từ một bài MCK thì phần lớn lô
 * đầu *nên* là MCK, chỉ những nghệ sĩ khác mới bị giữ ở mức 2 bài.
 */
const MAX_PER_ARTIST_PER_BATCH = 2;
const MAX_SEED_ARTIST_PER_BATCH = 6;
const TASTE_BOOST_SUBSCRIBED = 4;
const TASTE_BOOST_KNOWN = 2;
const TASTE_BOOST_LIKED_VIDEO = 3;
const LIBRARY_ARTIST_BOOST = 1;
const SKIPPED_ARTIST_PENALTY = -2;
/** Mỗi lô chèn tối đa 4 bài "gu thuần" của nghệ sĩ khác, để lô không thành một album. */
const TASTE_FILL = 4;

/**
 * Điểm dựng từ `play_events` — lịch sử nghe trong app, không phải số liệu YouTube.
 *
 * Nghe hết một bài nói nhiều hơn một lần bấm play, nên `FINISH` nặng hơn `PLAY`.
 * Điểm suy giảm một nửa mỗi 30 ngày để gu cũ không đè gu đang nghe.
 */
const HISTORY_WINDOW_DAYS = 90;
const HISTORY_HALF_LIFE_DAYS = 30;
const HISTORY_PLAY_WEIGHT = 1;
const HISTORY_FINISH_WEIGHT = 2;
/** Nghe một nghệ sĩ nhiều thế này trong tuần qua là đã mỏi tai → trừ điểm. */
const FATIGUE_PLAYS = 5;
const FATIGUE_PENALTY = -3;
/** Mỗi lô giữ mấy suất cho nghệ sĩ hoàn toàn mới, để gu không đóng băng. */
const EXPLORE_QUOTA = 2;

/** Bằng WEIGHT_SUBSCRIPTION trong taste.ts: từ mốc này trở lên là kênh đang đăng ký. */
const SUBSCRIBED_WEIGHT = 3;
/**
 * Số playlist đào mỗi lần làm mới. Giữ nhỏ để một lượt đào không kéo về hàng trăm
 * ứng viên: mỗi playlist thêm 1 unit `playlistItems.list` và một phần `videos.list`.
 */
const PLAYLISTS_PER_DIG = 2;

/** Chỉ lấy đúng những cột mà toPlayableTrack cần. */
const metaColumns = {
  videoId: youtubeTracks.videoId,
  title: youtubeTracks.title,
  artistName: youtubeTracks.artistName,
  channelTitle: youtubeTracks.channelTitle,
  durationSec: youtubeTracks.durationSec,
};

/**
 * Ứng viên đã gộp metadata với khoá so khớp.
 *
 * `artistKey`/`titleKey` tính sẵn vì cả bốn bước lọc và bước xếp hạng đều dùng;
 * `tiebreak` gán một lần trước khi sort để comparator ổn định (mỗi lần so hai
 * phần tử ra cùng kết quả, khác với gọi Math.random() trong comparator).
 */
interface Candidate {
  videoId: string;
  title: string;
  artistName: string | null;
  channelTitle: string | null;
  durationSec: number | null;
  artistKey: string;
  titleKey: string;
  tiebreak: number;
}

/** seedId là uuid (thư viện) hoặc "yt:<videoId>". */
export async function loadSeed(
  userId: string,
  seedId: string,
): Promise<PlayableTrack | null> {
  const videoId = parseYoutubeTrackId(seedId);
  if (!videoId) return getTrackById(userId, seedId);

  const [row] = await getDb()
    .select(metaColumns)
    .from(youtubeTracks)
    .where(eq(youtubeTracks.videoId, videoId))
    .limit(1);
  return row ? toPlayableTrack(row) : null;
}

export async function buildRadioBatch(args: {
  userId: string;
  seed: PlayableTrack;
  exclude: string[];
  limit: number;
}): Promise<PlayableTrack[]> {
  const { userId, seed, exclude, limit } = args;
  const seedArtistKey = normalizeKey(seed.artistName);
  const seedTitleKey = normalizeKey(seed.title);
  const seedKey = `${seedArtistKey}|${seedTitleKey}`;
  const artistQuery = seed.artistName ?? seed.title;

  const [cached] = await getDb()
    .select()
    .from(radioSeeds)
    .where(eq(radioSeeds.seedKey, seedKey))
    .limit(1);
  const cacheFresh = Boolean(
    cached && Date.now() - cached.fetchedAt.getTime() < CANDIDATE_TTL_MS,
  );

  const dig = () =>
    digWithCredential({
      userId,
      seedKey,
      artistQuery,
      seedVideoId: seed.youtubeVideoId,
      usedPlaylistIds: cached?.usedPlaylistIds ?? [],
    });

  let candidateIds = cacheFresh ? (cached?.candidateIds ?? []) : await dig();
  if (candidateIds.length === 0) return [];

  await refreshTasteIfStale(userId);
  const taste = await loadTasteProfile(userId);

  const pick = {
    userId,
    seedArtistKey,
    seedTitleKey,
    exclude,
    limit,
    taste,
  };
  const batch = await rankCandidates({ ...pick, candidateIds });
  if (batch.length > 0 || !cacheFresh) return batch;

  // Cache cũ đã bị lọc sạch (skip hết, hoặc trùng thư viện hết) → đào playlist
  // chưa dùng đúng một lần nữa. Không lặp: hết ứng viên là hết bài, client hiểu vậy.
  candidateIds = await dig();
  if (candidateIds.length === 0) return [];
  return rankCandidates({ ...pick, candidateIds });
}

/**
 * Đào ứng viên bằng credential tốt nhất đang có: token của user nếu đã nối tài
 * khoản, không thì `YOUTUBE_API_KEY` dùng chung — Data API nhận một trong hai.
 *
 * Google từ chối token: xin token mới rồi thử đúng một lần nữa. Vẫn bị từ chối thì
 * đánh dấu `needs_reauth` (UI mời cấp quyền lại) và lùi về API key nếu có.
 */
async function digWithCredential(args: {
  userId: string;
  seedKey: string;
  artistQuery: string;
  seedVideoId: string | null;
  usedPlaylistIds: string[];
}): Promise<string[]> {
  const { userId, seedKey, artistQuery, seedVideoId, usedPlaylistIds } = args;
  const dig = (accessToken?: string) =>
    digCandidates(
      seedKey,
      artistQuery,
      usedPlaylistIds,
      seedVideoId,
      accessToken,
    );

  const token = await callerAccessToken(userId);
  if (!token) return dig();

  try {
    return await dig(token);
  } catch (error) {
    if (!(error instanceof YoutubeReauthError)) throw error;

    const fresh = await callerAccessToken(userId, { force: true });
    if (fresh) {
      try {
        return await dig(fresh);
      } catch (retryError) {
        if (!(retryError instanceof YoutubeReauthError)) throw retryError;
      }
    }

    await markYoutubeNeedsReauth(userId);
    if (!process.env.YOUTUBE_API_KEY) throw error;
    return dig();
  }
}

/**
 * Access token của user để gọi Data API. Liên kết hỏng mà vẫn còn API key thì radio
 * phải chạy tiếp, nên lỗi ở đây chỉ được ghi log.
 */
async function callerAccessToken(
  userId: string,
  { force = false }: { force?: boolean } = {},
): Promise<string | undefined> {
  try {
    const token = force
      ? await refreshYoutubeAccessToken(userId)
      : await getYoutubeAccessToken(userId);
    return token ?? undefined;
  } catch (error) {
    console.warn("Không dùng được token YouTube của user", error);
    return undefined;
  }
}

/**
 * Đào ứng viên mới cho seed rồi ghi lại cache. Trả về danh sách videoId đã lọc
 * sạch (thuộc mục Nhạc, độ dài như một bài hát).
 *
 * Thứ tự nguồn: automix của YouTube Music → bài liên quan → Data API. Hai nguồn
 * đầu đi qua InnerTube nên không tốn quota; Data API chỉ chạy khi hai nguồn đầu
 * mỏng và còn credential.
 */
async function digCandidates(
  seedKey: string,
  artistQuery: string,
  usedPlaylistIds: string[],
  seedVideoId: string | null,
  accessToken?: string,
): Promise<string[]> {
  const used = new Set(usedPlaylistIds);
  const hits: MusicHit[] = [];

  if (seedVideoId) {
    const automix = await upNextQueue(seedVideoId, MAX_CANDIDATES);
    hits.push(...automix.hits);
    if (automix.playlistId) used.add(automix.playlistId);
    if (hits.length < MIN_CANDIDATES) {
      hits.push(...(await relatedSongs(seedVideoId, MAX_CANDIDATES)));
    }
  }

  const fromMusic = await persistHits(hits);
  const ids = new Set(
    fromMusic
      .map((track) => track.youtubeVideoId)
      .filter((videoId): videoId is string => videoId !== null),
  );

  const hasCredential = Boolean(accessToken ?? process.env.YOUTUBE_API_KEY);
  if (ids.size < MIN_CANDIDATES && hasCredential) {
    for (const id of await digViaDataApi(artistQuery, used, accessToken)) {
      ids.add(id);
    }
  }
  if (ids.size === 0) return [];

  const candidateIds = [...ids].slice(0, MAX_CANDIDATES);
  const usedIds = [...used];
  await getDb()
    .insert(radioSeeds)
    .values({ seedKey, candidateIds, usedPlaylistIds: usedIds })
    .onConflictDoUpdate({
      target: radioSeeds.seedKey,
      set: {
        candidateIds,
        usedPlaylistIds: usedIds,
        fetchedAt: new Date(),
      },
    });
  return candidateIds;
}

/**
 * Nhánh dự phòng bằng Data API: dò playlist "mix" của nghệ sĩ rồi lấy video trong
 * đó. Tốn quota nên chỉ gọi khi automix không đủ bài.
 */
async function digViaDataApi(
  artistQuery: string,
  used: Set<string>,
  accessToken?: string,
): Promise<string[]> {
  const found = await searchPlaylists(`${artistQuery} mix`, 5, accessToken);
  // Mix tự sinh (RD…) không đọc được qua Data API; playlist đã đào rồi thì lần
  // này bỏ qua để ra ứng viên mới thay vì lặp lại đúng danh sách cũ.
  const usable = found.filter(
    (playlist) =>
      !playlist.playlistId.startsWith("RD") &&
      !PLAYLIST_JUNK.test(playlist.title) &&
      !used.has(playlist.playlistId),
  );

  const ids = new Set<string>();
  for (const playlist of usable.slice(0, PLAYLISTS_PER_DIG)) {
    for (const id of await listPlaylistVideoIds(
      playlist.playlistId,
      50,
      accessToken,
    )) {
      ids.add(id);
    }
    used.add(playlist.playlistId);
  }
  if (ids.size < MIN_CANDIDATES) {
    for (const id of await searchMusicVideos(artistQuery, 25, accessToken)) {
      ids.add(id);
    }
  }
  if (ids.size === 0) return [];

  const videos = await listVideos([...ids], accessToken);
  const rows = videos
    .filter(
      (video) =>
        !video.isLive &&
        video.categoryId === MUSIC_CATEGORY_ID &&
        video.durationSec >= MIN_DURATION_SEC &&
        video.durationSec <= MAX_DURATION_SEC &&
        !LONG_FORM.test(video.rawTitle),
    )
    .map((video) => {
      const { artistName, title } = splitArtistTitle(
        video.rawTitle,
        video.channelTitle,
      );
      return {
        videoId: video.videoId,
        title,
        artistName,
        channelTitle: video.channelTitle,
        durationSec: video.durationSec,
      };
    });
  if (rows.length === 0) return [];

  await upsertYoutubeTracks(rows);
  return rows.map((row) => row.videoId);
}

/** Lọc rồi xếp hạng ứng viên của một seed — không gọi YouTube, chỉ đọc DB. */
async function rankCandidates(args: {
  userId: string;
  seedArtistKey: string;
  seedTitleKey: string;
  candidateIds: string[];
  exclude: string[];
  limit: number;
  taste: TasteProfile;
}): Promise<PlayableTrack[]> {
  const {
    userId,
    seedArtistKey,
    seedTitleKey,
    candidateIds,
    exclude,
    limit,
    taste,
  } = args;
  const db = getDb();

  const [cachedRows, tasteRows] = await Promise.all([
    db
      .select(metaColumns)
      .from(youtubeTracks)
      .where(
        and(
          inArray(youtubeTracks.videoId, candidateIds),
          eq(youtubeTracks.blocked, false),
        ),
      ),
    // Bài user đã thích / có trong playlist riêng: nguồn ứng viên miễn phí quota.
    // Vẫn phải qua cùng khung thời lượng như ứng viên đào được — video 30 giây hay
    // bản mix một tiếng nằm trong danh sách đã thích thì cũng không phải "bài nhạc".
    db
      .select(metaColumns)
      .from(youtubeTasteVideos)
      .innerJoin(
        youtubeTracks,
        eq(youtubeTasteVideos.videoId, youtubeTracks.videoId),
      )
      .where(
        and(
          eq(youtubeTasteVideos.userId, userId),
          eq(youtubeTracks.blocked, false),
          gte(youtubeTracks.durationSec, MIN_DURATION_SEC),
          lte(youtubeTracks.durationSec, MAX_DURATION_SEC),
        ),
      ),
  ]);

  const dug: Candidate[] = [];
  const fromTaste: Candidate[] = [];
  for (const { row, taste: isTaste } of [
    ...cachedRows.map((row) => ({ row, taste: false })),
    ...tasteRows.map((row) => ({ row, taste: true })),
  ]) {
    const candidate: Candidate = {
      ...row,
      artistKey: normalizeKey(row.artistName ?? row.channelTitle),
      titleKey: normalizeKey(row.title),
      tiebreak: Math.random(),
    };
    (isTaste ? fromTaste : dug).push(candidate);
  }

  // Gu nhạc góp hai kiểu ứng viên: bài cùng nghệ sĩ với lô vừa đào (chắc chắn liên
  // quan tới seed), và bài của nghệ sĩ khác đang nghe nhiều nhất — nếu thiếu nhánh
  // sau, một seed có cả kho bài riêng (album của chính nghệ sĩ đó) sẽ chiếm sạch lô
  // và radio nghe không khác gì mở nguyên album.
  const dugArtistKeys = new Set(dug.map((candidate) => candidate.artistKey));
  const related = fromTaste.filter((candidate) =>
    dugArtistKeys.has(candidate.artistKey),
  );
  const others = fromTaste
    .filter(
      (candidate) =>
        !dugArtistKeys.has(candidate.artistKey) &&
        !sameArtistKey(candidate.artistKey, seedArtistKey),
    )
    .sort(
      (a, b) =>
        (taste.artists.get(b.artistKey)?.weight ?? 0) -
        (taste.artists.get(a.artistKey)?.weight ?? 0),
    )
    .slice(0, TASTE_FILL);
  const extras = [...related, ...others];

  const pool = [...dug];
  const pooled = new Set(dug.map((candidate) => candidate.videoId));
  for (const candidate of extras) {
    if (pooled.has(candidate.videoId)) continue;
    pooled.add(candidate.videoId);
    pool.push(candidate);
  }

  // Client gửi PlayableTrack.id ("yt:<videoId>"), nhưng nhận cả dạng videoId trần.
  const excluded = new Set<string>();
  for (const id of exclude) {
    excluded.add(id);
    const videoId = parseYoutubeTrackId(id);
    if (videoId) excluded.add(videoId);
  }
  // Chính bài gốc có thể quay lại dưới dạng video YouTube với tên nghệ sĩ khác một
  // chút ("RPT MCK" trong thư viện, "MCK" trên YouTube) → so tên bài kèm khớp mờ.
  const shortlist = pool.filter(
    (candidate) =>
      !excluded.has(candidate.videoId) &&
      !(
        candidate.titleKey === seedTitleKey &&
        sameArtistKey(candidate.artistKey, seedArtistKey)
      ),
  );
  if (shortlist.length === 0) return [];

  const subjectKeys = [
    ...new Set(
      shortlist.flatMap((candidate) => [
        candidate.videoId,
        candidate.artistKey,
      ]),
    ),
  ];
  const [libraryRows, feedback, history] = await Promise.all([
    // Lọc trước theo tên bài (đã hạ chữ) để Postgres dùng được index, rồi so
    // khoá chuẩn hoá trong JS — cùng lượt này cho luôn tập nghệ sĩ của thư viện.
    db
      .select({
        title: tracks.title,
        artistName: sql<
          string | null
        >`coalesce(${artists.name}, ${tracks.artistName})`,
      })
      .from(tracks)
      .leftJoin(artists, eq(tracks.artistId, artists.id))
      .where(
        and(
          eq(tracks.userId, userId),
          inArray(
            sql`lower(${tracks.title})`,
            shortlist.map((candidate) => candidate.title.toLowerCase()),
          ),
        ),
      ),
    db
      .select()
      .from(radioFeedback)
      .where(
        and(
          eq(radioFeedback.userId, userId),
          inArray(radioFeedback.subjectKey, subjectKeys),
        ),
      ),
    // Lịch sử nghe của app: một lượt gộp theo nghệ sĩ, kèm mốc nghe cuối để suy
    // giảm theo thời gian và số lượt trong tuần qua để phát hiện mỏi tai.
    db
      .select({
        artistKey: playEvents.artistKey,
        plays: sql<number>`count(*)::int`,
        finishes: sql<number>`count(*) filter (where ${playEvents.completed})::int`,
        recent: sql<number>`count(*) filter (where ${playEvents.startedAt} > now() - interval '7 days')::int`,
        lastDays: sql<number>`extract(day from now() - max(${playEvents.startedAt}))::int`,
      })
      .from(playEvents)
      .where(
        and(
          eq(playEvents.userId, userId),
          gte(
            playEvents.startedAt,
            new Date(Date.now() - HISTORY_WINDOW_DAYS * 86_400_000),
          ),
        ),
      )
      .groupBy(playEvents.artistKey),
  ]);

  // Cùng lý do với bài gốc: tên nghệ sĩ trong thư viện và trên YouTube lệch nhau vài
  // chữ, nên giữ danh sách phẳng rồi khớp mờ (đã lọc theo tên bài nên rất ngắn).
  const libraryEntries: Array<{ artistKey: string; titleKey: string }> = [];
  const libraryArtistKeys: string[] = [];
  for (const row of libraryRows) {
    const artistKey = normalizeKey(row.artistName);
    if (artistKey) libraryArtistKeys.push(artistKey);
    libraryEntries.push({ artistKey, titleKey: normalizeKey(row.title) });
  }

  const videoStats = new Map<string, { skips: number; finishes: number }>();
  const artistStats = new Map<string, { skips: number; finishes: number }>();
  for (const row of feedback) {
    const target = row.subject === "video" ? videoStats : artistStats;
    target.set(row.subjectKey, { skips: row.skips, finishes: row.finishes });
  }

  const kept = shortlist.filter((candidate) => {
    const inLibrary = libraryEntries.some(
      (entry) =>
        entry.titleKey === candidate.titleKey &&
        sameArtistKey(entry.artistKey, candidate.artistKey),
    );
    if (inLibrary) return false;
    const video = videoStats.get(candidate.videoId);
    if (video && video.skips >= 1 && video.finishes === 0) return false;
    const artist = artistStats.get(candidate.artistKey);
    if (artist && artist.skips >= 2 && artist.finishes === 0) return false;
    return true;
  });

  // Khớp mờ như mọi chỗ khác: "MCK" trong play_events và "RPT MCK" trên YouTube là
  // một người, nên giữ danh sách phẳng rồi so từng khoá.
  const historyOf = (artistKey: string) =>
    history.find((row) => sameArtistKey(row.artistKey, artistKey)) ?? null;

  const scored: Scored[] = kept.map((candidate) => {
    const weight = taste.artists.get(candidate.artistKey)?.weight ?? 0;
    const artist = artistStats.get(candidate.artistKey);
    const played = historyOf(candidate.artistKey);

    // Điểm lịch sử nghe, suy giảm một nửa mỗi HISTORY_HALF_LIFE_DAYS ngày.
    const decay = played
      ? 0.5 ** (played.lastDays / HISTORY_HALF_LIFE_DAYS)
      : 0;
    const historyScore = played
      ? (played.plays * HISTORY_PLAY_WEIGHT +
          played.finishes * HISTORY_FINISH_WEIGHT) *
        decay
      : 0;

    const score =
      (weight >= SUBSCRIBED_WEIGHT
        ? TASTE_BOOST_SUBSCRIBED
        : weight > 0
          ? TASTE_BOOST_KNOWN
          : 0) +
      (taste.videoIds.has(candidate.videoId) ? TASTE_BOOST_LIKED_VIDEO : 0) +
      (libraryArtistKeys.some((key) => sameArtistKey(key, candidate.artistKey))
        ? LIBRARY_ARTIST_BOOST
        : 0) +
      (artist && artist.skips >= 1 && artist.finishes === 0
        ? SKIPPED_ARTIST_PENALTY
        : 0) +
      historyScore +
      (played && played.recent >= FATIGUE_PLAYS ? FATIGUE_PENALTY : 0);

    // "Chưa biết" = chưa từng nghe trong app VÀ không có trong gu lấy từ tài khoản.
    const explore = played === null && weight === 0;
    return { candidate, score, explore };
  });
  scored.sort(
    (a, b) => b.score - a.score || a.candidate.tiebreak - b.candidate.tiebreak,
  );

  const chosen = pickWithCaps(scored, limit, seedArtistKey);
  const exploreTaken = chosen.filter((entry) => entry.explore).length;
  if (exploreTaken < EXPLORE_QUOTA) {
    const picked = new Set(chosen.map((entry) => entry.candidate.videoId));
    const extras = pickWithCaps(
      scored.filter(
        (entry) => entry.explore && !picked.has(entry.candidate.videoId),
      ),
      EXPLORE_QUOTA - exploreTaken,
      seedArtistKey,
    );
    // Đổi chỗ những bài điểm thấp nhất, rồi rải suất khám phá vào giữa lô — chèn
    // hết ở cuối thì người nghe bấm next là mất luôn phần khám phá.
    for (const [index, extra] of extras.entries()) {
      if (chosen.length === 0) break;
      chosen.pop();
      chosen.splice(Math.min((index + 1) * 3, chosen.length), 0, extra);
    }
  }

  return chosen.map((entry) => toPlayableTrack(entry.candidate));
}

/** Ứng viên đã có điểm. `explore` = nghệ sĩ chưa từng xuất hiện trong gu lẫn lịch sử. */
interface Scored {
  candidate: Candidate;
  score: number;
  explore: boolean;
}

/**
 * Lấy theo thứ tự điểm nhưng chặn hạn mức mỗi nghệ sĩ. Tách riêng vì lô chính và
 * lô khám phá đều phải chịu cùng hạn mức đó.
 */
function pickWithCaps(
  scored: Scored[],
  limit: number,
  seedArtistKey: string,
): Scored[] {
  const perArtist = new Map<string, number>();
  const batch: Scored[] = [];
  for (const entry of scored) {
    if (batch.length >= limit) break;
    // "MCK", "RPT MCK", "MCK // Nger" là một người: gộp chung một hạn mức, nếu
    // không nghệ sĩ của bài gốc lại lách qua từng biến thể tên.
    const isSeedArtist = sameArtistKey(
      entry.candidate.artistKey,
      seedArtistKey,
    );
    const bucket = isSeedArtist ? seedArtistKey : entry.candidate.artistKey;
    const cap = isSeedArtist
      ? MAX_SEED_ARTIST_PER_BATCH
      : MAX_PER_ARTIST_PER_BATCH;
    const taken = perArtist.get(bucket) ?? 0;
    if (taken >= cap) continue;
    perArtist.set(bucket, taken + 1);
    batch.push(entry);
  }
  return batch;
}
