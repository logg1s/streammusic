/**
 * API công khai của `@vong/shared`.
 *
 * Liệt kê tường minh chứ không `export *`: loader ESM (Node/tsx) buộc phải biết tên
 * export ở thời điểm link, mà `export *` từ file TS thì nó không suy ra được —
 * `import { CHUNK_BYTES } from "@vong/shared"` sẽ ném SyntaxError. Đổi lại là danh
 * sách này chính là hợp đồng: thêm export mới phải khai ở đây.
 */

export type {
  AlbumSummary,
  FetchLike,
  FetchLikeResponse,
  PlayableTrack,
  PlaylistSummary,
  RadioState,
  RepeatMode,
  StorageProviderId,
  TrackSource,
} from "./types";

export {
  YOUTUBE_ID_PREFIX,
  parseYoutubeTrackId,
  toPlayableTrack,
  youtubeTrackId,
} from "./track";

export {
  LONG_FORM,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  PLAYLIST_JUNK,
  channelArtistName,
  normalizeKey,
  parseIso8601Duration,
  sameArtistKey,
  splitArtistTitle,
} from "./parse";

export {
  LoginRequiredError,
  VideoUnplayableError,
  audioRangeHeaders,
  createYoutubeResolver,
  fetchVisitorData,
  resolveAudio,
} from "./player-request";
export type { ResolvedAudio, YoutubeResolver } from "./player-request";

export {
  ANALYTICS_EVENTS,
  createAnalytics,
  isAnalyticsEvent,
  sanitizeProps,
} from "./analytics";
export type {
  Analytics,
  AnalyticsBatch,
  AnalyticsEvent,
  AnalyticsEventName,
  AnalyticsOptions,
  AnalyticsProps,
  AnalyticsPropValue,
  AnalyticsShell,
  AnalyticsStorage,
} from "./analytics";

export { createPlaybackAnalytics } from "./analytics-playback";
export type { PlaybackAnalytics, PlaybackSnapshot } from "./analytics-playback";

export { createPlayerStore } from "./player-store";
export type {
  PersistedPlayerState,
  PlaybackSink,
  PlayerState,
  PlayerStore,
  PlayerStoreOptions,
} from "./player-store";

export {
  MAX_RESEED_ATTEMPTS,
  RADIO_RETRY_CAP_MS,
  REFILL_THRESHOLD,
  autoplaySeed,
  createRadioClient,
  radioRetryDelayMs,
} from "./radio-client";
export type {
  PlayEndReason,
  PlayedTrack,
  RadioClient,
  RadioClientOptions,
} from "./radio-client";
export { createRadioEngine } from "./radio-engine";
export type { RadioEngine, RadioEngineOptions } from "./radio-engine";
