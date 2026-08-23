import { useCallback, useEffect, useState } from "react";
import { UnauthorizedError, apiJson } from "@/lib/api";

/**
 * Đọc một endpoint JSON của server.
 *
 * Không dùng thư viện data nào: cả app chỉ cần "gọi một lần khi vào màn hình, gọi lại
 * khi bấm thử lại". `path` nhận `null` để màn hình tìm kiếm tạm ngưng gọi khi ô nhập
 * còn trống — trả về trạng thái rỗng chứ không phải lỗi.
 */
export interface ApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Lượt request đã cung cấp `data`; giữ nguyên khi `reload` đang chờ phản hồi mới. */
  version: number;
  reload: () => void;
}

/**
 * Đổi mọi thứ ném ra thành câu tiếng Việt hiển thị được.
 *
 * `UnauthorizedError` được tách riêng vì nó không phải lỗi mạng: token đã hết hạn nên
 * người dùng phải đăng nhập lại, và câu chữ phải nói đúng thế.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof UnauthorizedError) {
    return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "Không tải được dữ liệu. Kiểm tra kết nối rồi thử lại.";
}

/** Kết quả của MỘT lượt gọi, gắn kèm `path` và lần thử đã sinh ra nó. */
interface Attempted<T> {
  path: string;
  attempt: number;
  data: T | null;
  error: string | null;
}

export function useApi<T>(path: string | null): ApiResult<T> {
  const [done, setDone] = useState<Attempted<T> | null>(null);
  /** Đổi giá trị là effect chạy lại — cách duy nhất để "gọi lại cùng một path". */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null) return;

    // Cờ này thay cho AbortController: `apiJson` đã đọc xong body rồi mới resolve nên
    // huỷ request không tiết kiệm được gì, còn setState sau khi unmount thì phải chặn.
    let alive = true;

    apiJson<T>(path)
      .then((result) => {
        if (alive) setDone({ path, attempt, data: result, error: null });
      })
      .catch((cause: unknown) => {
        if (alive) setDone({ path, attempt, data: null, error: errorMessage(cause) });
      });

    return () => {
      alive = false;
    };
  }, [path, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Trạng thái "đang tải" được SUY RA, không phải set trong effect: chỉ cần kết quả đang
  // giữ không thuộc lượt gọi hiện tại là biết đang chờ. Set trong thân effect thì mỗi lần
  // đổi path là hai lượt render liên tiếp, và màn hình nháy dữ liệu cũ trước khi trắng.
  if (path === null) {
    return { data: null, error: null, loading: false, version: -1, reload };
  }
  const settled =
    done !== null && done.path === path && done.attempt === attempt;
  if (settled) {
    return { data: done.data, error: done.error, loading: false, version: done.attempt, reload };
  }
  // Đang chờ lượt gọi hiện tại. Nếu là lượt RELOAD cùng path thì giữ dữ liệu cũ để danh
  // sách không nháy trắng (màn hình quay lại focus gọi lại mà vẫn thấy nội dung cũ); chỉ
  // trả null khi ĐỔI path vì dữ liệu cũ khi ấy thuộc màn hình khác.
  const stale = done !== null && done.path === path ? done.data : null;
  return { data: stale, error: null, loading: true, version: done?.attempt ?? -1, reload };
}
