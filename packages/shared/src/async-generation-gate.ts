/**
 * Cổng thế hệ cho công việc async mà chỉ lượt mới nhất được phép hoàn tất.
 *
 * Native playback cần nó khi resolve URL/nạp decoder: người nghe có thể đổi bài
 * trong lúc lượt trước đang chờ mạng. Thay vì để từng shell tự giữ một `useRef`
 * số nguyên, hợp đồng này làm rõ quyền sở hữu: `begin()` cấp quyền mới, mọi quyền
 * cũ phải tự bỏ kết quả sau mỗi `await` bằng `isCurrent()`.
 */
export interface AsyncGenerationGate {
  begin(): number;
  invalidate(): void;
  current(): number;
  isCurrent(generation: number): boolean;
}

export function createAsyncGenerationGate(): AsyncGenerationGate {
  let generation = 0;

  return {
    begin() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    current() {
      return generation;
    },
    isCurrent(candidate) {
      return candidate === generation;
    },
  };
}
