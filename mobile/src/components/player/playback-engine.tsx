import { useEffect, useRef, useState } from "react";
import {
  createAsyncGenerationGate,
  LoginRequiredError,
  VideoUnplayableError,
  type PlayableTrack,
} from "@vong/shared";
import {
  peekCurrentTrack,
  peekNextTrack,
  registerSink,
  useCurrentTrack,
  usePlayer,
} from "@/store/player";
import { forceRefreshSessionToken } from "@/lib/api";
import { radioEngine, reportBlocked } from "@/lib/radio-engine";
import { toNativeItem } from "@/lib/resolve";
import {
  VongAudio,
  type VongAudioError,
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

/**
 * Thôi thử lại sau ngần này bài lỗi liên tiếp — mạng chết thì đừng đốt cả hàng đợi.
 *
 * "Liên tiếp" tính theo TIẾNG ĐÃ RA, không theo số lần nhảy bài: bộ đếm chỉ về 0 khi
 * native báo đang phát ở giây > 0. Reset theo "đã nhảy được một bài" thì bộ đếm không
 * bao giờ chạm trần trong đúng trường hợp nó sinh ra để chặn — một loạt bài resolve
 * ngon nhưng phát là 403, mỗi lỗi lại nhảy một bài, mỗi cú nhảy lại reset bộ đếm.
 */
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
   * Bài đã được thử lại bằng token mới rồi. Một lần thôi: 401 lần hai nghĩa là phiên
   * hỏng thật, thử mãi chỉ là một vòng lặp im lặng.
   */
  const retriedAuthRef = useRef<string | null>(null);
  /**
   * Bài đã được resolve lại URL rồi. Một lần thôi, cùng lý do với `retriedAuthRef`:
   * 403 lần hai trên URL vừa xin xong nghĩa là video hỏng thật, không phải hết hạn.
   *
   * Tách khỏi `retriedAuthRef` chứ không dùng chung: một bài có thể ăn 401 rồi 403 vì
   * hai thứ khác nhau hết hạn, và dùng chung một ô nhớ thì lần chữa thứ hai bị chặn oan.
   */
  const retriedUrlRef = useRef<string | null>(null);
  /**
   * Số thứ tự lượt nạp. Tăng ở MỌI lượt bắt đầu nạp bài; mỗi lượt giữ số của mình và
   * bỏ cuộc ngay khi thấy số toàn cục đã nhích.
   *
   * Vì sao cần: `loadedRef`/`loadingRef` chỉ nói "có ai đó đang nạp", không nói "ai".
   * Bấm Next hai lần thật nhanh cho hai lượt `toNativeItem` chạy song song, không lượt
   * nào huỷ lượt nào, và lượt về TRƯỚC nhả khoá cho lượt về SAU ghi đè — hàng đợi native
   * kết thúc bằng bài đã bị bỏ, trong khi store trỏ bài khác. Kiểm tra sau MỌI `await`,
   * không chỉ sau cái đầu tiên: mỗi điểm chờ là một chỗ để bài hiện tại đổi.
   */
  const loadGateRef = useRef(createAsyncGenerationGate());
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
      loadGateRef.current.invalidate();
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

    const seq = loadGateRef.current.begin();
    /** Lượt nạp này đã bị một lượt mới hơn thay thế chưa. */
    const stale = () => !loadGateRef.current.isCurrent(seq);

    // Next liền mạch: bài mới CHÍNH LÀ đuôi đã resolve sẵn và đã nằm trong hàng đợi
    // native (effect 3 nối vào lúc bài trước đang chạy). Bấm Next trong app trước đây
    // đi qua đây và resolve lại + dựng lại MediaSource — đứt tiếng dù đã có sẵn. Thay
    // vào đó bảo ExoPlayer nhảy sang item nó đã chuẩn bị, đúng con đường mà tự-hết-bài
    // và Next trên màn hình khoá vẫn dùng. `trackChanged` sẽ về nhưng store.position đã
    // đúng (UI gọi store.next() trước) nên onTrackChanged bỏ qua — không nhảy hai lần.
    if (nextIdRef.current === trackId && nextItemRef.current) {
      loadedRef.current = trackId;
      currentItemRef.current = nextItemRef.current;
      nextIdRef.current = null;
      nextItemRef.current = null;
      void (async () => {
        await VongAudio.skipNext();
        if (stale()) return;
        // Giữ đúng ý muốn phát: skipNext không đổi playWhenReady, đây chỉ là bảo hiểm.
        if (usePlayer.getState().isPlaying) await VongAudio.play();
      })();
      return;
    }

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
        // Lượt nạp mới hơn đã cầm lái: bỏ kết quả này đi, và KHÔNG nhả khoá nạp —
        // khoá thuộc về lượt mới, nhả hộ là mở cổng cho event của hàng đợi cũ.
        if (stale()) return;
        currentItemRef.current = item;
        await VongAudio.setQueue({ items: [item], startIndex: 0, positionSec });
        if (stale()) return;
        // KHÔNG reset `failuresRef` ở đây: nạp xong hàng đợi không phải bằng chứng là
        // có tiếng. Đúng lớp lỗi mà bộ đếm phải chặn — URL resolve ngon rồi phát mới
        // 403 — đi qua điểm này thành công mỗi lần. Bộ đếm về 0 ở listener `state`.
        loadingRef.current = false;
        const after = usePlayer.getState();
        after.setBuffering(false);
        // Nạp xong mới chốt trạng thái phát: effect 4 đã bị khoá nạp bỏ qua.
        if (after.isPlaying) await VongAudio.play();
        else await VongAudio.pause();
      } catch (error) {
        // Lỗi của một bài đã bị bỏ lại không được đụng vào bài đang nạp — nhất là
        // không được đếm vào `failuresRef` hay nhảy bài.
        if (stale()) return;
        loadingRef.current = false;
        loadedRef.current = null;
        currentItemRef.current = null;
        failuresRef.current += 1;
        const after = usePlayer.getState();
        after.setBuffering(false);
        // Vẫn ghi lỗi kể cả khi nhảy bài: không còn bài nào để nhảy thì đây là thứ duy
        // nhất người dùng thấy được.
        after.setError(messageOf(error));

        // Video hỏng thật (bị gỡ, chặn nhúng, chặn theo vùng) — báo về để lô sau không
        // gặp lại. Chỉ báo cho ĐÚNG lớp lỗi này: `LoginRequiredError` và lỗi mạng là
        // chuyện của phía mình, báo lên thành "video hỏng" là loại oan bài tốt khỏi mọi
        // lô gợi ý sau này. Trước đây vỏ Android không báo gì cả, nên tín hiệu này chỉ
        // bao giờ về server từ trình duyệt.
        if (
          error instanceof VideoUnplayableError &&
          current.source === "youtube" &&
          current.youtubeVideoId
        ) {
          reportBlocked(current.youtubeVideoId);
        }
        if (
          failuresRef.current < MAX_CONSECUTIVE_FAILURES &&
          peekNextTrack()
        ) {
          // Đánh dấu TRƯỚC khi nhảy: cú nhảy này là của máy, không phải của người;
          // nếu thiếu, bài lỗi bị coi là skip chủ động và chặn lại trong phiên.
          radioEngine.noteError(current.id);
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
      const seq = loadGateRef.current.current();
      // Đuôi này thuộc về lượt nạp nào. Bài hiện tại đổi giữa chừng là cả cái đuôi vô
      // nghĩa: ghi nó vào `nextIdRef` là gắn đuôi của một vị trí đã bỏ làm "bài kế liền
      // mạch" của vị trí mới — đúng báo cáo "bấm Next ra nhầm bài".
      const stale = () =>
        !loadGateRef.current.isCurrent(seq) ||
        loadingRef.current ||
        currentItemRef.current !== current;

      void (async () => {
        try {
          const tail = wanted ? await toNativeItem(wanted) : null;
          // Trong lúc chờ resolve người dùng có thể đã đổi bài: bỏ kết quả cũ đi.
          if (stale()) return;
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
          // `nextIdRef` để thôi thử lại ở mỗi nhịp `state` — nhưng chỉ khi lượt này còn
          // là lượt hiện hành, nếu không là xoá mất cái đuôi hợp lệ của lượt mới.
          if (stale()) return;
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
      // Bằng chứng DUY NHẤT được chấp nhận là "bài này phát được": có ý muốn phát và
      // đồng hồ đã chạy. Xem ghi chú ở `MAX_CONSECUTIVE_FAILURES`.
      if (state.playing && state.positionSec > 0) {
        failuresRef.current = 0;
        retriedAuthRef.current = null;
        retriedUrlRef.current = null;
      }
      const store = usePlayer.getState();
      // Chưa đọc được `moov` thì native trả 0; giữ lấy thời lượng đang có, đừng để
      // scrubber sập về 0.
      const duration =
        state.durationSec > 0 ? state.durationSec : store.duration;
      store.syncTime(state.positionSec, duration);
      store.syncPlaying(state.playing);
      store.setBuffering(state.buffering);
    });

    const onEnded = VongAudio.addListener("ended", ({ id }) => {
      if (loadingRef.current) return;
      const endedId = peekCurrentTrack()?.id ?? null;
      // `ended` của một bài store đã rời khỏi: bỏ qua. Nghe theo là một cú nhảy bài
      // không ai giải thích được — cùng một lớp lỗi với `error` gán nhầm bài.
      if (id && id !== endedId) return;
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

    /**
     * Nạp lại đúng bài đang phát bằng thông tin vừa xin mới, giữ nguyên chỗ đang nghe.
     *
     * Một hàm cho cả hai lớp lỗi "hết hạn", vì cách chữa giống hệt nhau — chỉ khác ở
     * thứ hết hạn:
     * - `refreshAuth` (401, bài thư viện): token của Vọng nướng trong header của item.
     * - `!refreshAuth` (403, bài YouTube): URL googlevideo. `toNativeItem` luôn resolve
     *   lại chứ không có cache, nên chỉ cần gọi lại là có URL mới.
     *
     * Hai lần `setQueue` chứ không một: sau lỗi, item hỏng vẫn là item hiện tại của
     * ExoPlayer và player đang ở `STATE_IDLE`. `setQueue` với cùng `mediaId` đi vào
     * nhánh `replaceAround` — giữ nguyên item cũ, không `prepare()` — nên nó sẽ nạp lại
     * đúng cái xác đó. Hàng đợi rỗng làm native `stop()` + `clearMediaItems()`, lần gọi
     * sau mới thật sự dựng lại `MediaSource` và `prepare()`.
     */
    const reloadCurrent = async (track: PlayableTrack, refreshAuth: boolean) => {
      // Nạp lại cũng là một lượt nạp: nó phải giành được quyền cầm lái, và phải chịu
      // bị một lượt mới hơn (người dùng bấm Next) hất ra như mọi lượt khác.
      const seq = loadGateRef.current.begin();
      const stale = () => !loadGateRef.current.isCurrent(seq);

      loadingRef.current = true;
      const store = usePlayer.getState();
      store.setBuffering(true);
      const positionSec = store.currentTime;
      try {
        if (refreshAuth) {
          const token = await forceRefreshSessionToken();
          if (stale()) return;
          if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
        }
        const item = await toNativeItem(track);
        // Người dùng có thể đã đổi bài trong lúc chờ mạng: bỏ kết quả cũ đi. Lượt mới
        // sở hữu khoá nạp nên KHÔNG nhả hộ; chỉ khi không có lượt nào khác (bài vẫn là
        // bài này mà id đã đổi thì cũng không còn ai nạp) mới phải tự dọn.
        if (stale()) return;
        if (peekCurrentTrack()?.id !== track.id) {
          loadingRef.current = false;
          usePlayer.getState().setBuffering(false);
          return;
        }

        currentItemRef.current = item;
        nextIdRef.current = null;
        nextItemRef.current = null;
        loadedRef.current = track.id;
        await VongAudio.setQueue({ items: [], startIndex: 0, positionSec: 0 });
        if (stale()) return;
        await VongAudio.setQueue({ items: [item], startIndex: 0, positionSec });
        if (stale()) return;
        loadingRef.current = false;
        const after = usePlayer.getState();
        after.setBuffering(false);
        if (after.isPlaying) await VongAudio.play();
      } catch (error) {
        if (stale()) return;
        loadingRef.current = false;
        loadedRef.current = null;
        currentItemRef.current = null;
        failuresRef.current += 1;
        const after = usePlayer.getState();
        after.setBuffering(false);
        after.setError(messageOf(error));
        if (failuresRef.current < MAX_CONSECUTIVE_FAILURES && peekNextTrack()) {
          radioEngine.noteError(track.id);
          after.next();
        }
      }
    };

    /**
     * Lỗi phát từ ExoPlayer. Trước đây native nuốt hẳn sự kiện này: nhạc lặng đi, cờ
     * phát tắt, không lời nhắn, không nhảy bài.
     *
     * Ba điều kiện trước khi làm gì: đang nạp thì bỏ qua (như ba listener kia), lỗi
     * của bài đã bị bỏ lại thì bỏ qua (lỗi và cú đổi bài chạy đua với nhau thật), và
     * KHÔNG bao giờ tự đi hỏi URL từ JS — mọi request byte phải đi qua
     * `RangeForcingDataSource`, hỏi thẳng từ đây là thiếu `Range` và ăn 403.
     */
    const onError = VongAudio.addListener("error", (error: VongAudioError) => {
      if (loadingRef.current) return;
      const current = peekCurrentTrack();
      if (!current) return;
      if (error.id && error.id !== current.id) return;

      // 401 trên bài thư viện = token trong hàng đợi native đã hết hạn, KHÔNG phải bài
      // hỏng. `toNativeItem` nướng header vào item lúc resolve, nên một bài nằm ở đuôi
      // suốt một bài dài có thể mang token đã chết khi ExoPlayer mở request. Nhảy bài ở
      // đây là cả hàng đợi thư viện trôi qua trong im lặng — đúng triệu chứng mà cả
      // chu kỳ này sinh ra để xoá, chỉ đổi nguyên nhân.
      if (
        error.httpCode === 401 &&
        current.source === "library" &&
        retriedAuthRef.current !== current.id
      ) {
        retriedAuthRef.current = current.id;
        void reloadCurrent(current, true);
        return;
      }

      // 403 trên bài YouTube = URL googlevideo đã hết hạn, KHÔNG phải video hỏng. URL
      // sống ~6h còn hàng đợi native giữ sẵn bài kế, nên một bài nằm ở đuôi qua một
      // phiên nghe dài — hoặc app bị treo nền rồi mở lại — mở request bằng URL đã chết.
      //
      // Đây là lớp lỗi mà `httpCode` được kéo lên từ Kotlin để phân biệt: nhảy bài ở
      // đây là bỏ một bài hoàn toàn tốt, và nếu cả lô cùng hết hạn thì là bỏ cả lô.
      // Resolve lại rẻ hơn nhiều so với việc đốt hàng đợi.
      if (
        error.httpCode === 403 &&
        current.source === "youtube" &&
        retriedUrlRef.current !== current.id
      ) {
        retriedUrlRef.current = current.id;
        void reloadCurrent(current, false);
        return;
      }

      failuresRef.current += 1;
      const store = usePlayer.getState();
      store.setError(error.message);
      if (failuresRef.current < MAX_CONSECUTIVE_FAILURES && peekNextTrack()) {
        // Của máy, không phải của người — xem ghi chú ở đường resolve hỏng.
        radioEngine.noteError(current.id);
        store.next();
      }
    });

    return () => {
      onState.remove();
      onEnded.remove();
      onTrackChanged.remove();
      onError.remove();
    };
  }, []);

  // RadioController sống ở đây (không ở `app/_layout.tsx`) để hai thứ cùng vòng đời:
  // nạp thêm bài chỉ có nghĩa khi có engine phát chúng.
  return <RadioController />;
}
