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

const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const RPC_BASE = "https://api.dropboxapi.com/2";
const SCOPES = "account_info.read files.metadata.read files.content.read";

interface DropboxEntry {
  ".tag": "file" | "folder" | "deleted";
  id: string;
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  content_hash?: string;
}

interface ListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

function credentials() {
  const clientId = process.env.DROPBOX_CLIENT_ID;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Thiếu DROPBOX_CLIENT_ID / DROPBOX_CLIENT_SECRET");
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
      throw new ReauthRequiredError("dropbox", body);
    }
    throw new ProviderApiError("dropbox", res.status, body, TOKEN_URL);
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

/** Dropbox dùng RPC: POST + JSON body, kể cả khi không có tham số. */
async function rpc<T>(
  accessToken: string,
  path: string,
  body: unknown,
): Promise<T> {
  const url = `${RPC_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ProviderApiError(
      "dropbox",
      res.status,
      await readErrorBody(res),
      url,
    );
  }
  return (await res.json()) as T;
}

export const dropboxProvider: StorageProvider = {
  id: "dropbox",
  displayName: "Dropbox",
  // Dropbox biểu diễn thư mục gốc bằng chuỗi rỗng, không phải "/".
  rootFolderId: "",
  scopes: SCOPES,

  isConfigured() {
    return Boolean(
      process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET,
    );
  },

  buildAuthUrl(state, redirectUri) {
    const { clientId } = credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      // Bắt buộc để nhận refresh_token; nếu không, access token chỉ sống 4 giờ.
      token_access_type: "offline",
      scope: SCOPES,
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
    const account = await rpc<{
      account_id: string;
      email: string;
      name: { display_name: string };
    }>(accessToken, "/users/get_current_account", undefined);
    return {
      accountId: account.account_id,
      label: account.email || account.name.display_name,
    };
  },

  async listFolder(accessToken, folderId): Promise<RemoteEntry[]> {
    const entries: RemoteEntry[] = [];
    let page = await rpc<ListFolderResult>(accessToken, "/files/list_folder", {
      path: folderId,
      recursive: false,
      limit: 2000,
    });

    for (;;) {
      for (const e of page.entries) {
        if (e[".tag"] === "deleted") continue;
        entries.push({
          // path_lower là khoá gọi API tin cậy nhất của Dropbox; id chỉ có ở file/folder thường.
          id: e.path_lower ?? e.id,
          name: e.name,
          path: e.path_display ?? e.path_lower ?? `/${e.name}`,
          isFolder: e[".tag"] === "folder",
        });
      }
      if (!page.has_more) break;
      page = await rpc<ListFolderResult>(
        accessToken,
        "/files/list_folder/continue",
        { cursor: page.cursor },
      );
    }

    return entries.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name, "vi");
    });
  },

  async *listAudioFiles(accessToken, rootId): AsyncGenerator<RemoteFile> {
    // Ưu điểm lớn của Dropbox: recursive:true lấy hết cây thư mục trong một lượt phân trang,
    // không cần tự duyệt BFS như Drive/OneDrive.
    let page = await rpc<ListFolderResult>(accessToken, "/files/list_folder", {
      path: rootId,
      recursive: true,
      limit: 2000,
    });

    for (;;) {
      for (const e of page.entries) {
        if (e[".tag"] !== "file") continue;
        if (!isAudioFile(e.name)) continue;
        yield {
          id: e.path_lower ?? e.id,
          name: e.name,
          path: e.path_display ?? e.path_lower ?? `/${e.name}`,
          mimeType: guessMimeType(e.name),
          sizeBytes: e.size ?? null,
          rev: e.content_hash ?? null,
        };
      }
      if (!page.has_more) break;
      page = await rpc<ListFolderResult>(
        accessToken,
        "/files/list_folder/continue",
        { cursor: page.cursor },
      );
    }
  },

  async resolveStream(accessToken, remoteId): Promise<StreamTarget> {
    const result = await rpc<{ link: string }>(
      accessToken,
      "/files/get_temporary_link",
      { path: remoteId },
    );
    return {
      kind: "redirect",
      url: result.link,
      // Dropbox ghi rõ link sống 4 giờ; trừ hao 10 phút cho an toàn.
      expiresAt: new Date(Date.now() + (4 * 60 - 10) * 60 * 1000),
    };
  },
};
