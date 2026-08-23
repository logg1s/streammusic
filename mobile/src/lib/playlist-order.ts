/** Trả danh sách mới sau khi đưa một phần tử sang vị trí khác, không làm biến đổi đầu vào. */
export function movePlaylistItem<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
