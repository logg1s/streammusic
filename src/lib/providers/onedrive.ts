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

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "offline_access User.Read Files.Read";

interface GraphItem {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  cTag?: string;
  folder?: { childCount: number };
  file?: { mimeType?: string };
  parentReference?: { path?: string };
}

function credentials() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Thiếu MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

async function tokenRequest(
  params: Record<string, string>,
  { forRefresh }: { forRefresh: boolean },
): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const url = `${AUTHORITY}/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: clientId,
      client_secret: clientSecret,
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const body = await readErrorBody(res);
    if (forRefresh && isInvalidGrant(res.status, body)) {
      throw new ReauthRequiredError("onedrive", body);
    }
    throw new ProviderApiError("onedrive", res.status, body, url);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: json.access_token,
    // Microsoft XOAY refresh_token mỗi lần refresh — bắt buộc lưu lại giá trị mới,
    // nếu giữ token cũ thì lần refresh sau sẽ hỏng.
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scope: json.scope ?? null,
  };
}

async function graphGet<T>(accessToken: string, url: string): Promise<T> {
  const absolute = url.startsWith("http") ? url : `${GRAPH}${url}`;
  const res = await fetch(absolute, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ProviderApiError(
      "onedrive",
      res.status,
      await readErrorBody(res),
      absolute,
    );
  }
  return (await res.json()) as T;
}

function childrenUrl(folderId: string): string {
  const base =
    !folderId || folderId === "root"
      ? "/me/drive/root/children"
      : `/me/drive/items/${encodeURIComponent(folderId)}/children`;
  return `${base}?$top=200&$select=id,name,size,eTag,cTag,folder,file,parentReference`;
}

async function listChildren(
  accessToken: string,
  folderId: string,
): Promise<GraphItem[]> {
  const items: GraphItem[] = [];
  let next: string | undefined = childrenUrl(folderId);

  while (next) {
    const page: { value: GraphItem[]; "@odata.nextLink"?: string } =
      await graphGet(accessToken, next);
    items.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return items;
}

export const oneDriveProvider: StorageProvider = {
  id: "onedrive",
  displayName: "OneDrive",
  rootFolderId: "root",
  scopes: SCOPES,

  isConfigured() {
    return Boolean(
      process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET,
    );
  },

  buildAuthUrl(state, redirectUri) {
    const { clientId } = credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES,
      state,
    });
    return `${AUTHORITY}/authorize?${params}`;
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
    const me = await graphGet<{
      id: string;
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    }>(accessToken, "/me");
    return {
      accountId: me.id,
      label: me.mail || me.userPrincipalName || me.displayName || me.id,
    };
  },

  async listFolder(accessToken, folderId): Promise<RemoteEntry[]> {
    const items = await listChildren(accessToken, folderId);
    return items
      .map((i) => ({
        id: i.id,
        name: i.name,
        path: i.name,
        isFolder: Boolean(i.folder),
      }))
      .sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, "vi");
      });
  },

  async *listAudioFiles(accessToken, rootId): AsyncGenerator<RemoteFile> {
    // Graph có /delta cho đồng bộ tăng dần, nhưng v1 chỉ cần duyệt BFS đơn giản.
    const queue: Array<{ id: string; path: string }> = [
      { id: rootId || "root", path: "" },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const folder = queue.shift()!;
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);

      for (const item of await listChildren(accessToken, folder.id)) {
        const itemPath = `${folder.path}/${item.name}`;
        if (item.folder) {
          queue.push({ id: item.id, path: itemPath });
          continue;
        }
        if (!isAudioFile(item.name, item.file?.mimeType)) continue;

        yield {
          id: item.id,
          name: item.name,
          path: itemPath,
          mimeType: guessMimeType(item.name, item.file?.mimeType),
          sizeBytes: item.size ?? null,
          // cTag đổi khi NỘI DUNG đổi; eTag còn đổi khi chỉ sửa metadata → ưu tiên cTag.
          rev: item.cTag ?? item.eTag ?? null,
        };
      }
    }
  },

  async resolveStream(accessToken, remoteId): Promise<StreamTarget> {
    // /content trả 302 tới URL đã pre-authenticate. Đọc header Location thay vì
    // đi theo redirect để lấy được URL dùng trực tiếp cho thẻ <audio>.
    const url = `${GRAPH}/me/drive/items/${encodeURIComponent(remoteId)}/content`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "manual",
    });

    const location = res.headers.get("location");
    if (location) {
      return {
        kind: "redirect",
        url: location,
        // URL pre-auth của Graph sống khoảng 1 giờ; trừ hao 5 phút.
        expiresAt: new Date(Date.now() + 55 * 60 * 1000),
      };
    }

    if (!res.ok) {
      throw new ProviderApiError(
        "onedrive",
        res.status,
        await readErrorBody(res),
        url,
      );
    }

    // Không có Location (hiếm) → quay về chế độ proxy để vẫn phát được nhạc.
    return {
      kind: "proxy",
      url,
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  },
};
