import type {
  AlbumSummary,
  PlayableTrack,
  PlaylistSummary,
  StorageProviderId,
} from "@vong/shared";
import type { LibraryStats } from "@/lib/format";

/**
 * Hình dạng JSON của các endpoint mà app đọc.
 *
 * Khai ở đây thay vì import type của server: `src/lib/library.ts` kéo theo `drizzle-orm`
 * và `pg`, Metro không bundle được. Mỗi interface dưới đây phải khớp `Response.json(...)`
 * của route tương ứng — lệch là màn hình đọc `undefined` mà TypeScript không kêu.
 */

export interface LibraryHome {
  played: PlayableTrack[];
  recent: PlayableTrack[];
  albums: AlbumSummary[];
  stats: LibraryStats;
}

export interface TracksPage {
  tracks: PlayableTrack[];
  page: number;
  pageSize: number;
  totalPages: number;
  stats: LibraryStats;
}

export interface AlbumList {
  albums: AlbumSummary[];
}

/** `GET /api/library/albums/<id>` — trả nguyên kết quả `getAlbum`, tức hai nhánh. */
export interface AlbumDetail {
  album: {
    id: string;
    title: string;
    year: number | null;
    coverUrl: string | null;
    artistId: string | null;
    artistName: string | null;
  };
  tracks: PlayableTrack[];
}

export interface ArtistSummary {
  id: string;
  name: string;
  trackCount: number;
}

export interface ArtistList {
  artists: ArtistSummary[];
}

/** `GET /api/library/artists/<id>` — `singles` là bài không gắn album nào. */
export interface ArtistDetail {
  artist: { id: string; name: string };
  albums: AlbumSummary[];
  singles: PlayableTrack[];
}

export interface SearchResult {
  tracks: PlayableTrack[];
  albums: AlbumSummary[];
}

export interface TrackList {
  tracks: PlayableTrack[];
}

export interface YoutubeSections {
  sections: { title: string; tracks: PlayableTrack[] }[];
}

/**
 * `createdAt` là `Date` phía server nhưng qua JSON thành chuỗi ISO — vì thế không dùng
 * thẳng `PlaylistSummary` được.
 */
export type PlaylistRow = Omit<PlaylistSummary, "createdAt"> & {
  createdAt: string;
};

export interface PlaylistList {
  playlists: PlaylistRow[];
}

export interface PlaylistDetail {
  playlist: { id: string; name: string; seedLabel: string | null };
  items: { itemId: string; track: PlayableTrack }[];
}

/** `POST /api/youtube/sync` — số đếm của một lượt đồng bộ gu nhạc. */
export interface YoutubeSyncResult {
  liked: number;
  subscriptions: number;
  artists: number;
}

/** `GET /api/connections/<id>/browse` — route đã lọc sẵn, `entries` chỉ còn thư mục. */
export interface BrowseResult {
  folderId: string | null;
  rootFolderId: string;
  entries: { id: string; name: string; path: string }[];
}

/** `POST /api/scan` — job đã xếp hàng, chưa xử lý file nào. */
export interface ScanStart {
  jobId: string;
  totalFiles: number;
}

/**
 * `POST /api/scan/<id>/step` — một lô đã xử lý.
 *
 * `job` là tuỳ chọn vì route trả thẳng kết quả `processBatch` khi job đã bị huỷ hay
 * hỏng; nơi gọi phải coi việc thiếu nó là "không đo được tiến độ", không phải số 0.
 */
export interface ScanStep {
  done: boolean;
  job?: {
    totalFiles: number;
    processedFiles: number;
    skippedFiles: number;
    failedFiles: number;
  };
}

export interface ConnectionsSummary {
  connections: {
    id: string;
    provider: StorageProviderId;
    label: string;
    status: string;
    trackCount: number;
    roots: { id: string; remoteId: string; name: string; path: string }[];
  }[];
  available: { id: StorageProviderId; displayName: string }[];
  youtube: {
    configured: boolean;
    connected: boolean;
    channelTitle: string | null;
    needsReauth: boolean;
    likedCount: number;
    artistCount: number;
  };
}
