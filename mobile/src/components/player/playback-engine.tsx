import { useEffect, useRef, useState } from "react";
import { LoginRequiredError, VideoUnplayableError } from "@vong/shared";
import {
  peekCurrentTrack,
  peekNextTrack,
  registerSink,
  useCurrentTrack,
  usePlayer,
} from "@/store/player";
import { toNativeItem } from "@/lib/resolve";
import {
  VongAudio,
  type VongAudioItem,
  type VongAudioState,
} from "../../../modules/vong-audio";
import { RadioController } from "./radio-controller";

/**
 * Cầu nối giữa store phát nhạc và module native `vong-audio`. Không render gì.
 *
 * Store là sự thật duy nhất về "đang nghe bài nào": mọi thứ native báo về đều được
 * dịch lại thành lệnh của store, và mọi thay đổi của store đều được dịch xuống native.
 *
 * ── BẤT BIẾN 1: HÀNG ĐỢI NATIVE CHỈ CÓ BÀI HIỆN TẠI + BÀI KẾ ─────────────────
 * URL của googlevideo hết hạn sau ~6 giờ và phải resolve từng bài trên máy, nên nạp cả
 * hàng đợi xuống native là tự tay tạo ra một dãy bài chết. Đổi lại, bài kế PHẢI có sẵn
 * trong hàng đợi native, nếu không Next trên màn hình khoá sẽ im lặng không làm gì.
 * Vì `setQueue` so id của item đang phát (`items[startIndex].id`) rồi giữ nguyên item
 * đó, việc nối bài kế vào đuôi không hề làm bài hiện tại phát lại từ đầu.
 *
 * ── BẤT BIẾN 2: KHOÁ NẠP BÀI (loadingRef) ────────────────────────────────────
 * Trong quãng đang resolve + `setQueue`, native vẫn bắn `state` của hàng đợi CŨ (hoặc
 * của hàng đợi rỗng: `positionSec: 0`, `playing: false`). Nghe theo là scrubber tụt về
 * 0 và `isPlaying` tắt ở mỗi lần đổi bài, tệ hơn là `ended` của bài cũ làm store nhảy
 * thêm một bài. Nên trong quãng đó mọi event native bị bỏ qua.
 */

/** Thôi thử lại sau ngần này bài lỗi liên tiếp — mạng chết thì đừng đốt cả hàng đợi. */
const MAX_CONSECUTIVE_FAILURES = 3;

function messageOf(error: unknown): string {
  if (error instanceof LoginRequiredError) {
    return "YouTube đòi đăng nhập trên mạng này. Đổi mạng rồi thử lại.";
  }
  if (error instanceof VideoUnplayableError) {
    return "Video này không phát được (đã bị gỡ hoặc để riêng tư).";
  }
  return error instanceof Error
    ? error.message
    : "Không phát được bài này trên máy này.";
}

export function PlaybackEngine() {
  const track = useCurrentTrack();
  const trackId = track?.id ?? null;
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);

  /** Bài native đang phát. So với `trackId` để biết có phải nạp lại hay không. */
  const loadedRef = useRef<string | null>(null);
  /** Xem BẤT BIẾN 2 ở đầu file. */
  const loadingRef = useRef(false);
  /** Item đang phát, giữ lại để nối đuôi mà không phải resolve lại URL của nó. */
  const currentItemRef = useRef<VongAudioItem | null>(null);
  /** Bài kế đã nằm trong hàng đợi native; null = đuôi đang trống. */
  const nextIdRef = useRef<string | null>(null);
  const nextItemRef = useRef<VongAudioItem | null>(null);
  /** Chặn hai lượt nối đuôi chồng nhau: store phát state mỗi ~400 ms. */
  const toppingRef = useRef(false);
  const failuresRef = useRef(0);
  /**
   * Bơm để chạy lại effect nạp bài khi `trackId` KHÔNG đổi: hết hàng đợi thì native đã
   * cạn item, phải nạp lại chính bài đó ở giây 0 để nút phát còn tác dụng.
   */
  const [reloadNonce, setReloadNonce] = useState(0);

  // 1. Sink của cả hai nguồn: `store.seek()` đi thẳng xuống native.
  useEffect(() => {
    const seek = (seconds: number) => {
      void VongAudio.seek(seconds);
    };
    registerSink("library", { seek });
    registerSink("youtube", { seek });
    return () => {
      registerSink("library", null);
      registerSink("youtube", null);
    };
  }, []);

  // 2. Đổi bài: resolve rồi thay hàng đợi native bằng đúng bài đó. Đuôi (bài kế) do
  //    effect 3 nối vào sau, khi bài này đã chạy.
  useEffect(() => {
    if (!trackId) {
      loadedRef.current = null;
      currentItemRef.current = null;
      nextIdRef.current = null;
      nextItemRef.current = null;
      void VongAudio.setQueue({ items: [], startIndex: 0, positionSec: 0 });
      return;
    }
    if (loadedRef.current === trackId) return;

    const current = peekCurrentTrack();
    if (!current || current.id !== trackId) return;

    const store = usePlayer.getState();
    // Khôi phục chỗ đang nghe sau khi mở lại app: chỉ dùng đúng một lần.
    const positionSec = store.consumePendingSeek() ?? 0;

    loadedRef.current = trackId;
    loadingRef.current = true;
    nextIdRef.current = null;
    nextItemRef.current = null;
    store.setBuffering(true);

    void (async () => {
      try {
        const item = await toNativeItem(current);
        currentItemRef.current = item;
        await VongAudio.setQueue({ items: [item], startIndex: 0, positionSec });
        failuresRef.current = 0;
        loadingRef.current = false;
        const after = usePlayer.getState();
        after.setBuffering(false);
        // Nạp xong mới chốt trạng thái phát: effect 4 đã bị khoá nạp bỏ qua.
        if (after.isPlaying) await VongAudio.play();
        else await VongAudio.pause();
      } catch (error) {
        loadingRef.current = false;
        loadedRef.current = null;
        currentItemRef.current = null;
        failuresRef.current += 1;
        const after = usePlayer.getState();
        after.setBuffering(false);
        // Vẫn ghi lỗi kể cả khi nhảy bài: không còn bài nào để nhảy thì đây là thứ duy
        // nhất người dùng thấy được.
        after.setError(messageOf(error));
        if (
          failuresRef.current < MAX_CONSECUTIVE_FAILURES &&
          peekNextTrack()
        ) {
          // `playTrackAt` trong `next()` tự xoá lỗi và phát tiếp.
          after.next();
        }
      }
    })();
  }, [trackId, reloadNonce]);

  // 3. Nối bài kế vào đuôi hàng đợi native, và chạy lại mỗi khi bài kế đổi (xáo bài,
  //    radio nạp thêm, người dùng kéo bài lên trên). Xem BẤT BIẾN 1.
  useEffect(() => {
    const syncTail = () => {
      if (loadingRef.current || toppingRef.current) return;

      const current = currentItemRef.current;
      const playing = peekCurrentTrack();
      // Chưa nạp xong bài hiện tại thì chưa có gì để nối đuôi vào.
      if (!current || !playing || playing.id !== loadedRef.current) return;

      // Lặp một bài: đuôi PHẢI trống, nếu không ExoPlayer nhảy sang bài sau thay vì
      // phát lại bài này.
      const wanted =
        usePlayer.getState().repeat === "one" ? null : peekNextTrack();
      const wantedId = wanted?.id ?? null;
      if (wantedId === nextIdRef.current) return;

      toppingRef.current = true;
      void (async () => {
        try {
          const tail = wanted ? await toNativeItem(wanted) : null;
          // Trong lúc chờ resolve người dùng có thể đã đổi bài: bỏ kết quả cũ đi.
          if (loadingRef.current || currentItemRef.current !== current) return;
          nextItemRef.current = tail;
          nextIdRef.current = wantedId;
          await VongAudio.setQueue({
            items: tail ? [current, tail] : [current],
            startIndex: 0,
            positionSec: usePlayer.getState().currentTime,
          });
        } catch {
          // Bài kế không resolve được: để đuôi trống (Next trên màn hình khoá sẽ không
          // nhảy được đúng bài đó, nhưng bài đang phát không bị ảnh hưởng). Vẫn ghi
          // `nextIdRef` để thôi thử lại ở mỗi nhịp `state`.
          nextItemRef.current = null;
          nextIdRef.current = wantedId;
        } finally {
          toppingRef.current = false;
        }
      })();
    };

    syncTail();
    return usePlayer.subscribe(syncTail);
  }, []);

  // 4. Phát/tạm dừng. Bài đang nạp thì bỏ qua — effect 2 tự chốt trạng thái cuối.
  useEffect(() => {
    if (!trackId || loadingRef.current) return;
    void (isPlaying ? VongAudio.play() : VongAudio.pause());
  }, [isPlaying, trackId]);

  // 5. Âm lượng. Tắt tiếng = âm lượng 0: native chỉ có một núm.
  useEffect(() => {
    void VongAudio.setVolume(muted ? 0 : volume);
  }, [volume, muted]);

  // 6. Event từ native: nhịp thời gian, hết hàng đợi, và bài đổi do native tự nhảy
  //    (hết bài, hoặc Next trên màn hình khoá).
  useEffect(() => {
    const onState = VongAudio.addListener("state", (state: VongAudioState) => {
      if (loadingRef.current) return;
      const store = usePlayer.getState();
      // Chưa đọc được `moov` thì native trả 0; giữ lấy thời lượng đang có, đừng để
      // scrubber sập về 0.
      const duration =
        state.durationSec > 0 ? state.durationSec : store.duration;
      store.syncTime(state.positionSec, duration);
      store.syncPlaying(state.playing);
      store.setBuffering(state.buffering);
    });

    const onEnded = VongAudio.addListener("ended", () => {
      if (loadingRef.current) return;
      const endedId = peekCurrentTrack()?.id ?? null;
      usePlayer.getState().handleEnded();

      const after = usePlayer.getState();
      const stillSame = peekCurrentTrack()?.id === endedId;
      if (!stillSame) return; // `next()` đã đổi bài — effect 2 lo phần còn lại.

      if (after.isPlaying) {
        // Lặp một bài: store đã tua về 0 qua sink, chỉ cần bảo native phát lại.
        void VongAudio.play();
        return;
      }
      // Hết hàng đợi: nạp lại chính bài này ở giây 0. `trackId` không đổi nên effect 2
      // chỉ chạy lại khi được bơm nonce.
      loadedRef.current = null;
      setReloadNonce((n) => n + 1);
    });

    const onTrackChanged = VongAudio.addListener(
      "trackChanged",
      ({ id }: { index: number; id: string }) => {
        if (loadingRef.current) return;
        const store = usePlayer.getState();
        // Dùng `id` chứ không dùng `index`: chỉ số của native luôn là 0/1 trong hàng
        // đợi hai bài, chẳng nói gì về vị trí trong hàng đợi của store.
        const position = store.order.findIndex(
          (queueIndex) => store.queue[queueIndex]?.id === id,
        );
        if (position < 0 || position === store.position) return;

        const tail = nextItemRef.current;
        if (tail && tail.id === id) {
          // Bài vừa nhảy tới chính là đuôi ta nối vào: đánh dấu đã nạp TRƯỚC khi đổi
          // store, để effect 2 không nạp lại và làm tiếng đang chạy đứt.
          loadedRef.current = id;
          currentItemRef.current = tail;
        }
        nextIdRef.current = null;
        nextItemRef.current = null;
        store.playTrackAt(position);
      },
    );

    return () => {
      onState.remove();
      onEnded.remove();
      onTrackChanged.remove();
    };
  }, []);

  // RadioController sống ở đây (không ở `app/_layout.tsx`) để hai thứ cùng vòng đời:
  // nạp thêm bài chỉ có nghĩa khi có engine phát chúng.
  return <RadioController />;
}
