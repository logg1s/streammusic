import {
  index,
  integer,
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
    type: text("type").$type<"oauth" | "oidc" | "email" | "webauthn">().notNull(),
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
