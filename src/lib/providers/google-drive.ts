import {
  guessMimeType,
  isAudioFile,
  isInvalidGrant,
  ProviderApiError,
  readErrorBody,
  ReauthRequiredError,
  type AccountIdentity,
  type RemoteEntry,
  type RemoteFile,
  type StorageProvider,
  type StreamTarget,
  type TokenSet,
} from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

/**
 * `drive.readonly` là RESTRICTED SCOPE của Google.
 * - App ở trạng thái Testing: không cần verify (tối đa 100 test user) NHƯNG refresh token
 *   hết hạn sau 7 ngày → user phải cấp quyền lại hàng tuần.
 * - Muốn Published: cần Google app verification + CASA security assessment.
 * - Có Google Workspace: đặt consent screen là Internal để tránh cả hai.
 *
 * `drive.file` không dùng được vì chỉ thấy file do chính app tạo ra.
 */
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

const FOLDER_MIME = "application/vnd.google-apps.folder";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  modifiedTime?: string;
}

const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)";

function credentials() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Thiếu AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET");
  }
  return { clientId, clientSecret };
}

async function tokenRequest(
  params: Record<string, string>,
  { forRefresh }: { forRefresh: boolean },
): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await readErrorBody(res);
    if (forRefresh && isInvalidGrant(res.status, body)) {
      throw new ReauthRequiredError("google_drive", body);
    }
    throw new ProviderApiError("google_drive", res.status, body, TOKEN_URL);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scope: json.scope ?? null,
  };
}

async function driveGet<T>(
  accessToken: string,
  path: string,
  query: Record<string, string>,
): Promise<T> {
  const url = `${DRIVE_API}${path}?${new URLSearchParams(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ProviderApiError(
      "google_drive",
      res.status,
      await readErrorBody(res),
      url,
    );
  }
  return (await res.json()) as T;
}

/** Liệt kê con trực tiếp của một thư mục, tự xử lý phân trang. */
async function listChildren(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const page: { files?: DriveFile[]; nextPageToken?: string } = await driveGet(
      accessToken,
      "/files",
      {
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: LIST_FIELDS,
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        ...(pageToken ? { pageToken } : {}),
      },
    );
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return files;
}

export const googleDriveProvider: StorageProvider = {
  id: "google_drive",
  displayName: "Google Drive",
  rootFolderId: "root",
  scopes: SCOPES,

  isConfigured() {
    return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  },

  buildAuthUrl(state, redirectUri) {
    const { clientId } = credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      // access_type=offline + prompt=consent là cách duy nhất chắc chắn nhận được
      // refresh_token; Google chỉ cấp nó ở lần đồng ý đầu tiên nếu không ép prompt.
      // Thêm select_account để người có nhiều tài khoản Google chọn được đúng Drive
      // muốn nối — nếu không, Google im lặng dùng tài khoản đang hoạt động.
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_URL}?${params}`;
  },

  exchangeCode(code, redirectUri) {
    return tokenRequest(
      { code, grant_type: "authorization_code", redirect_uri: redirectUri },
      { forRefresh: false },
    );
  },

  refresh(refreshToken) {
    return tokenRequest(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      { forRefresh: true },
    );
  },

  async getIdentity(accessToken): Promise<AccountIdentity> {
    const about = await driveGet<{
      user: { displayName: string; emailAddress: string; permissionId: string };
    }>(accessToken, "/about", {
      fields: "user(displayName,emailAddress,permissionId)",
    });
    return {
      accountId: about.user.permissionId || about.user.emailAddress,
      label: about.user.emailAddress || about.user.displayName,
    };
  },

  async listFolder(accessToken, folderId): Promise<RemoteEntry[]> {
    const children = await listChildren(accessToken, folderId || "root");
    return children
      .filter(
        (f) =>
          f.mimeType === FOLDER_MIME ||
          isAudioFile(f.name, f.mimeType) ||
          // Bỏ qua Google Docs/Sheets/… vì không tải được dưới dạng file thường.
          !f.mimeType.startsWith("application/vnd.google-apps"),
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        // Drive không có khái niệm đường dẫn; folder picker chỉ hiển thị tên.
        path: f.name,
        isFolder: f.mimeType === FOLDER_MIME,
      }))
      .sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, "vi");
      });
  },

  async *listAudioFiles(accessToken, rootId): AsyncGenerator<RemoteFile> {
    // Drive không hỗ trợ liệt kê đệ quy → tự duyệt BFS và tự dựng đường dẫn
    // từ tên thư mục cha để hiển thị và để đoán artist/album khi file thiếu tag.
    const queue: Array<{ id: string; path: string }> = [
      { id: rootId || "root", path: "" },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const folder = queue.shift()!;
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);

      const children = await listChildren(accessToken, folder.id);
      for (const child of children) {
        const childPath = `${folder.path}/${child.name}`;
        if (child.mimeType === FOLDER_MIME) {
          queue.push({ id: child.id, path: childPath });
          continue;
        }
        if (child.mimeType.startsWith("application/vnd.google-apps")) continue;
        if (!isAudioFile(child.name, child.mimeType)) continue;

        yield {
          id: child.id,
          name: child.name,
          path: childPath,
          mimeType: guessMimeType(child.name, child.mimeType),
          sizeBytes: child.size ? Number(child.size) : null,
          rev: child.md5Checksum ?? child.modifiedTime ?? null,
        };
      }
    }
  },

  async resolveStream(accessToken, remoteId): Promise<StreamTarget> {
    // Drive KHÔNG có link tạm thời tự xác thực: mọi byte bắt buộc kèm header
    // Authorization, nên phải proxy qua server mình (xem /api/stream/[trackId]).
    return {
      kind: "proxy",
      url: `${DRIVE_API}/files/${encodeURIComponent(remoteId)}?alt=media&supportsAllDrives=true`,
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  },
};
