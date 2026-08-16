import { useEffect } from "react";
import { primeAuth, radioEngine } from "@/lib/radio-engine";
import { usePlayer, type PlayerState } from "@/store/player";

/**
 * Cầu nối giữa store và bộ não radio.
 *
 * Toàn bộ quyết định — khi nào nạp thêm, lùi bao lâu sau lỗi, khi nào xoay seed, khi
 * nào tự bật radio — nằm ở `createRadioEngine` trong `@vong/shared`, không nằm ở đây.
 * Trước đây file này giữ một bản chép tay của logic đó, đối xứng với bản trong web;
 * hai bản đã lệch nhau ở đường xử lý lỗi, và không bản nào test được vì cả hai đều là
 * component. Cả hai vỏ giờ chạy đúng một bộ mã, và bộ mã đó có soak test.
 *
 * Không render gì. `PlaybackEngine` mount nó để hai thứ cùng vòng đời — nạp thêm bài
 * chỉ có nghĩa khi có engine phát chúng.
 */
export function RadioController() {
  useEffect(() => {
    void primeAuth();

    const currentId = (state: PlayerState) =>
      state.queue[state.order[state.position]]?.id ?? null;

    const initial = usePlayer.getState();
    radioEngine.handle(initial);

    // Đổi bài là mốc rẻ nhất để làm mới token: một lần đọc Keystore mỗi bài. Đây là
    // phần DUY NHẤT còn lại của vỏ — không phải quyết định radio, mà là chuyện
    // `authHeader` của shared bắt buộc đồng bộ trong khi SecureStore thì không.
    let lastId = currentId(initial);
    return usePlayer.subscribe((state) => {
      const id = currentId(state);
      if (id !== lastId) {
        lastId = id;
        void primeAuth();
      }
      radioEngine.handle(state);
    });
  }, []);

  return null;
}
