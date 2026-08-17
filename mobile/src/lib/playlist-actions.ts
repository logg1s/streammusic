import { apiFetch, apiJson } from "@/lib/api";

/**
 * Sáu lệnh ghi lên playlist của máy chủ.
 *
 * Gom vào một chỗ vì hình dạng body là thứ dễ lệch nhất giữa các màn hình: `POST
 * /api/playlists` nhận `items: [{ id }]` còn `POST .../items` nhận `ids: [...]`, và
 * `PATCH .../items` đòi ĐỦ tập itemId hiện có. Màn hình chỉ gọi hàm ở đây, không tự
 * dựng request — lệch một chữ là server trả 400 mà TypeScript không kêu.
 *
 * Mọi hàm đều ném (`apiFetch` lo phần đó) để nơi gọi bắt bằng `errorMessage`.
 */

/** Trả về id playlist vừa tạo. `trackIds` không được rỗng — server từ chối playlist trắng. */
export async function createPlaylist(
  name: string,
  trackIds: string[],
  seedLabel: string | null = null,
): Promise<string> {
  const body = await apiJson<{ id: string }>("/api/playlists", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      items: trackIds.map((id) => ({ id })),
      seedLabel,
    }),
  });
  return body.id;
}

export async function renamePlaylist(
  playlistId: string,
  name: string,
): Promise<void> {
  await apiFetch(`/api/playlists/${playlistId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: name.trim() }),
  });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await apiFetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
}

/**
 * Nối bài vào cuối playlist. Trả về SỐ BÀI THẬT SỰ được thêm: server bỏ qua bài đã có,
 * nên `0` là "đã có sẵn" chứ không phải lỗi, và lời báo cho người dùng phải khác nhau.
 */
export async function addToPlaylist(
  playlistId: string,
  trackIds: string[],
): Promise<number> {
  const body = await apiJson<{ added: number }>(
    `/api/playlists/${playlistId}/items`,
    { method: "POST", body: JSON.stringify({ ids: trackIds }) },
  );
  return body.added;
}

export async function removeFromPlaylist(
  playlistId: string,
  itemId: string,
): Promise<void> {
  await apiFetch(`/api/playlists/${playlistId}/items/${itemId}`, {
    method: "DELETE",
  });
}

/** `itemIds` phải là đúng tập item đang có, chỉ khác thứ tự. */
export async function reorderPlaylist(
  playlistId: string,
  itemIds: string[],
): Promise<void> {
  await apiFetch(`/api/playlists/${playlistId}/items`, {
    method: "PATCH",
    body: JSON.stringify({ itemIds }),
  });
}
