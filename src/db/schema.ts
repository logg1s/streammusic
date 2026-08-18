import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Auth.js — tên bảng/cột phải khớp đúng với @auth/drizzle-adapter     */
/* ------------------------------------------------------------------ */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type")
      .$type<"oauth" | "oidc" | "email" | "webauthn">()
      .notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ------------------------------------------------------------------ */
/* Kết nối tới nhà cung cấp lưu trữ                                    */
/* ------------------------------------------------------------------ */

export const storageProviderEnum = pgEnum("storage_provider", [
  "google_drive",
  "dropbox",
  "onedrive",
]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "active",
  "needs_reauth",
]);

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: storageProviderEnum("provider").notNull(),
    /** ID tài khoản phía provider — dùng để chặn nối trùng cùng một tài khoản. */
    providerAccountId: text("provider_account_id").notNull(),
    /** Email hoặc tên hiển thị, chỉ để hiện lên UI. */
    label: text("label").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
    status: connectionStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("connections_account_uq").on(
      t.userId,
      t.provider,
      t.providerAccountId,
    ),
    index("connections_user_idx").on(t.userId),
  ],
);

/** Thư mục người dùng chọn làm gốc để quét nhạc. */
export const scanRoots = pgTable(
  "scan_roots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    /** Drive: folderId · Dropbox: path_lower · OneDrive: itemId */
    remoteId: text("remote_id").notNull(),
    path: text("path").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("scan_roots_uq").on(t.connectionId, t.remoteId)],
);

/* ------------------------------------------------------------------ */
/* Thư viện nhạc                                                       */
/* ------------------------------------------------------------------ */

export const artists = pgTable(
  "artists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("artists_user_name_uq").on(t.userId, sql`lower(${t.name})`),
  ],
);

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id").references(() => artists.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    year: integer("year"),
    coverUrl: text("cover_url"),
    /** sha256 của ảnh bìa — để không upload trùng cùng một ảnh lên Blob. */
    coverHash: text("cover_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("albums_user_artist_title_uq").on(
      t.userId,
      sql`coalesce(${t.artistId}::text, '')`,
      sql`lower(${t.title})`,
    ),
  ],
);

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),

    /* Nhận diện file phía provider */
    remoteId: text("remote_id").notNull(),
    /** md5Checksum (Drive) · content_hash (Dropbox) · eTag (OneDrive) — để quét lại bỏ qua file không đổi. */
    remoteRev: text("remote_rev"),
    path: text("path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    /* Metadata đọc từ tag */
    title: text("title").notNull(),
    artistId: uuid("artist_id").references(() => artists.id, {
      onDelete: "set null",
    }),
    albumId: uuid("album_id").references(() => albums.id, {
      onDelete: "set null",
    }),
    /** Album artist / artist thô, giữ lại để hiển thị khi không map được. */
    artistName: text("artist_name"),
    albumName: text("album_name"),
    trackNo: integer("track_no"),
    discNo: integer("disc_no"),
    durationSec: real("duration_sec"),
    bitrate: integer("bitrate"),
    codec: text("codec"),
    genre: text("genre"),
    year: integer("year"),

    /* Cache link stream tạm thời của Dropbox/OneDrive */
    streamUrlCache: text("stream_url_cache"),
    streamUrlExpiresAt: timestamp("stream_url_expires_at", {
      withTimezone: true,
    }),

    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tracks_remote_uq").on(t.connectionId, t.remoteId),
    index("tracks_user_added_idx").on(t.userId, t.addedAt),
    index("tracks_album_idx").on(t.albumId, t.discNo, t.trackNo),
    index("tracks_artist_idx").on(t.artistId),
  ],
);

/* ------------------------------------------------------------------ */
/* Radio YouTube — bài tương tự, gu nhạc, playlist                     */
/* ------------------------------------------------------------------ */

/** Bộ nhớ đệm metadata video YouTube — dùng chung mọi user, không chứa dữ liệu riêng tư. */
export const youtubeTracks = pgTable("youtube_tracks", {
  videoId: text("video_id").primaryKey(),
  /** Tên bài đã làm sạch (bỏ "Official MV", "[Lyrics]"…). */
  title: text("title").notNull(),
  artistName: text("artist_name"),
  channelTitle: text("channel_title"),
  durationSec: integer("duration_sec"),
  /** IFrame player báo 101/150 (chủ kênh chặn nhúng) → không đưa vào lô sau nữa. */
  blocked: boolean("blocked").notNull().default(false),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Danh sách ứng viên đã đào cho một seed. Tồn tại chỉ để tiết kiệm hạn 100 lần search.list/ngày. */
export const radioSeeds = pgTable("radio_seeds", {
  /** normalizeKey(artist) + "|" + normalizeKey(title) */
  seedKey: text("seed_key").primaryKey(),
  candidateIds: text("candidate_ids").array().notNull(),
  /** Playlist đã đào rồi — lần làm mới sau bỏ qua để ra ứng viên mới. */
  usedPlaylistIds: text("used_playlist_ids").array().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const radioSubjectEnum = pgEnum("radio_subject", ["video", "artist"]);

export const youtubeTasteSourceEnum = pgEnum("youtube_taste_source", [
  "liked",
  "own_playlist",
]);

/** Đếm skip/finish để lô gợi ý sau tránh thứ người dùng đã bỏ qua. */
export const radioFeedback = pgTable(
  "radio_feedback",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: radioSubjectEnum("subject").notNull(),
    /** videoId, hoặc normalizeKey(artistName). */
    subjectKey: text("subject_key").notNull(),
    skips: integer("skips").notNull().default(0),
    finishes: integer("finishes").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.subject, t.subjectKey] })],
);

/**
 * Lịch sử nghe của chính app — nguồn duy nhất cho "Nghe gần đây" và cho công thức
 * xếp hạng radio. Cố tình KHÔNG lấy số liệu từ YouTube: điều khoản Data API cấm
 * lưu/suy diễn dữ liệu người dùng của họ (§III.E.4.h).
 */
export const playEvents = pgTable(
  "play_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").references(() => tracks.id, {
      onDelete: "cascade",
    }),
    youtubeVideoId: text("youtube_video_id").references(
      () => youtubeTracks.videoId,
      { onDelete: "cascade" },
    ),
    /** normalizeKey(artistName) — xếp hạng theo nghệ sĩ không cần join lại. */
    artistKey: text("artist_key").notNull(),
    playedSec: integer("played_sec").notNull(),
    durationSec: integer("duration_sec"),
    completed: boolean("completed").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "play_events_one_source",
      sql`(${t.trackId} is null) <> (${t.youtubeVideoId} is null)`,
    ),
    index("play_events_user_time_idx").on(t.userId, t.startedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Telemetry sản phẩm — ẩn danh, tách hẳn khỏi danh tính người dùng     */
/* ------------------------------------------------------------------ */

export const analyticsShellEnum = pgEnum("analytics_shell", [
  "web",
  "android",
  "windows",
]);

/**
 * Số liệu vận hành: bao nhiêu phiên có radio, bỏ bài trong bao lâu, bao lâu thì ra
 * tiếng, resolve hỏng bao nhiêu phần trăm.
 *
 * Cố tình KHÔNG có `userId` và KHÔNG có khoá ngoại tới `user` — nếu nối được vào tài
 * khoản thì đây không còn là bảng đếm mà thành hồ sơ nghe nhạc thứ hai. Muốn phân tích
 * theo người dùng thì dùng `play_events`, nơi việc đó là chủ đích và có kiểm soát.
 *
 * `installId` do máy người dùng sinh ra và có thể xoá; danh mục sự kiện được chốt cứng
 * ở `ANALYTICS_EVENTS` trong `@vong/shared`, nơi mỗi sự kiện có ghi chú props kèm theo.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** UUID sinh tại máy, ẩn danh. */
    installId: uuid("install_id").notNull(),
    /** Một lần chạy app; cho phép đếm chỉ số theo phiên mà không cần định danh máy. */
    sessionId: uuid("session_id").notNull(),
    shell: analyticsShellEnum("shell").notNull(),
    appVersion: text("app_version"),
    name: text("name").notNull(),
    /** Đã qua `sanitizeProps` — chỉ còn nhãn ngắn, số và boolean. */
    props: jsonb("props").$type<Record<string, string | number | boolean | null>>(),
    /** Đồng hồ máy người dùng; có thể lệch, giữ lại để đo độ trễ gửi. */
    clientTs: timestamp("client_ts", { withTimezone: true }).notNull(),
    serverTs: timestamp("server_ts", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("analytics_events_name_time_idx").on(t.name, t.serverTs),
    index("analytics_events_install_time_idx").on(t.installId, t.serverTs),
    index("analytics_events_session_idx").on(t.sessionId),
  ],
);

export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Radio nào sinh ra playlist này; null nếu lưu từ hàng đợi thường. */
    seedLabel: text("seed_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("playlists_user_idx").on(t.userId, t.createdAt)],
);

/** Một item là bài thư viện HOẶC video YouTube — check constraint ép đúng một trong hai. */
export const playlistItems = pgTable(
  "playlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    trackId: uuid("track_id").references(() => tracks.id, {
      onDelete: "cascade",
    }),
    youtubeVideoId: text("youtube_video_id").references(
      () => youtubeTracks.videoId,
      { onDelete: "cascade" },
    ),
  },
  (t) => [
    index("playlist_items_idx").on(t.playlistId, t.position),
    check(
      "playlist_items_one_source",
      sql`(${t.trackId} is null) <> (${t.youtubeVideoId} is null)`,
    ),
  ],
);

/** Một bài yêu thích là bài thư viện HOẶC video YouTube, duy nhất theo từng user. */
export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").references(() => tracks.id, {
      onDelete: "cascade",
    }),
    youtubeVideoId: text("youtube_video_id").references(
      () => youtubeTracks.videoId,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "favorites_one_source",
      sql`(${t.trackId} is null) <> (${t.youtubeVideoId} is null)`,
    ),
    uniqueIndex("favorites_user_track_uq").on(t.userId, t.trackId),
    uniqueIndex("favorites_user_youtube_uq").on(
      t.userId,
      t.youtubeVideoId,
    ),
    index("favorites_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/** Một user nối đúng một tài khoản YouTube; token mã hoá bằng đúng cơ chế của connections. */
export const youtubeAccounts = pgTable("youtube_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  channelTitle: text("channel_title").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  status: connectionStatusEnum("status").notNull().default("active"),
  linkedAt: timestamp("linked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Lần đồng bộ gu nhạc gần nhất; null = chưa đồng bộ. */
  tasteSyncedAt: timestamp("taste_synced_at", { withTimezone: true }),
});

/** Nghệ sĩ trong gu, weight cộng dồn: đăng ký kênh 3, video đã thích 2, playlist riêng 1. */
export const youtubeTasteArtists = pgTable(
  "youtube_taste_artists",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** normalizeKey(tên nghệ sĩ hoặc tên kênh). */
    artistKey: text("artist_key").notNull(),
    /** Tên gốc để hiện lên UI. */
    label: text("label").notNull(),
    weight: integer("weight").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.artistKey] })],
);

/** Video user đã thích / có trong playlist riêng — vừa là tín hiệu gu, vừa là nguồn ứng viên. */
export const youtubeTasteVideos = pgTable(
  "youtube_taste_videos",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => youtubeTracks.videoId, { onDelete: "cascade" }),
    source: youtubeTasteSourceEnum("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] })],
);

/* ------------------------------------------------------------------ */
/* Công việc quét thư viện                                             */
/* ------------------------------------------------------------------ */

export const scanStatusEnum = pgEnum("scan_status", [
  "listing",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const scanItemStateEnum = pgEnum("scan_item_state", [
  "pending",
  "done",
  "skipped",
  "failed",
]);

export const scanJobs = pgTable(
  "scan_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    status: scanStatusEnum("status").notNull().default("listing"),
    totalFiles: integer("total_files").notNull().default(0),
    processedFiles: integer("processed_files").notNull().default(0),
    skippedFiles: integer("skipped_files").notNull().default(0),
    failedFiles: integer("failed_files").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("scan_jobs_user_idx").on(t.userId, t.startedAt)],
);

/** Hàng đợi file chờ đọc tag. Cho phép quét theo lô và tiếp tục sau khi dừng. */
export const scanItems = pgTable(
  "scan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => scanJobs.id, { onDelete: "cascade" }),
    remoteId: text("remote_id").notNull(),
    remoteRev: text("remote_rev"),
    path: text("path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    state: scanItemStateEnum("state").notNull().default("pending"),
    error: text("error"),
  },
  (t) => [index("scan_items_job_state_idx").on(t.jobId, t.state)],
);

export type Connection = typeof connections.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type Artist = typeof artists.$inferSelect;
export type ScanJob = typeof scanJobs.$inferSelect;
export type ScanItem = typeof scanItems.$inferSelect;
export type StorageProviderId = (typeof storageProviderEnum.enumValues)[number];
export type YoutubeTrackRow = typeof youtubeTracks.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type PlaylistItem = typeof playlistItems.$inferSelect;
export type YoutubeAccount = typeof youtubeAccounts.$inferSelect;
export type PlayEvent = typeof playEvents.$inferSelect;
export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
