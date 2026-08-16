import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/store/player";

/**
 * Thời gian phát nội suy mượt giữa các nhịp `state` của native (~400 ms một lần).
 *
 * Native chỉ báo vị trí mỗi ~400 ms, nên thanh tua nhảy từng bậc thấy rõ. Ở đây neo
 * lại theo mốc thật gần nhất rồi tự cộng thời gian trôi (đo bằng timestamp của
 * `requestAnimationFrame`), cho thanh tua chạy ~60 fps mà KHÔNG thêm một byte cầu nối
 * JS↔native nào.
 *
 * Vì nó cập nhật state mỗi khung hình, chỉ gọi trong component NHỎ (bản thân thanh
 * tua / vạch tiến độ) — gọi ở màn hình lớn sẽ dựng lại cả cây mỗi khung hình.
 *
 * setState chỉ nằm trong callback (subscribe / vòng RAF), không gọi thẳng trong thân
 * effect: vừa mượt, vừa thoả `react-hooks/set-state-in-effect` và `purity` (không
 * `Date.now()` trong render/effect — dùng timestamp mà RAF đưa vào).
 */
export function useSmoothTime(): number {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const [time, setTime] = useState(() => usePlayer.getState().currentTime);
  /** Vị trí thật gần nhất do native báo. */
  const base = useRef(usePlayer.getState().currentTime);
  /** Timestamp RAF lúc neo; -1 = cần neo lại ở khung hình kế. */
  const anchorTs = useRef(-1);

  // Native báo vị trí mới (hoặc người dùng tua) → cập nhật mốc. Đứng yên thì đặt luôn
  // giá trị hiển thị; đang phát thì để vòng RAF lo (neo lại theo timestamp của nó).
  useEffect(() => {
    let last = usePlayer.getState().currentTime;
    const unsub = usePlayer.subscribe((s) => {
      if (s.currentTime === last) return;
      last = s.currentTime;
      base.current = s.currentTime;
      anchorTs.current = -1;
      if (!s.isPlaying) setTime(s.currentTime);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const loop = (ts: number) => {
      if (anchorTs.current < 0) anchorTs.current = ts;
      const duration = usePlayer.getState().duration;
      const next = base.current + (ts - anchorTs.current) / 1000;
      setTime(duration > 0 ? Math.min(duration, next) : next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      anchorTs.current = -1;
      cancelAnimationFrame(raf);
    };
  }, [isPlaying]);

  return time;
}
