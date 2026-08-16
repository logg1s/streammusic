import { useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSmoothTime } from "@/lib/use-smooth-time";
import { usePlayer } from "@/store/player";
import { colors, font, radius, spacing } from "@/theme";

/** Giây → "m:ss" (hoặc "h:mm:ss" cho bài dài hơn một giờ). */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * Thanh tua của màn hình phát, TÁCH RIÊNG để chỉ nó dựng lại mỗi khung hình.
 *
 * `useSmoothTime` cập nhật ~60 fps; nếu đặt trong `PlayerScreen` thì cả FlatList hàng
 * đợi dựng lại theo. Ở đây nó tự quản việc kéo và vị trí, `PlayerScreen` không còn
 * đăng ký `currentTime` nên đứng yên trong lúc phát.
 *
 * Kéo dùng thẳng hệ responder của View (không `PanResponder`): handler chỉ chạy khi có
 * ngón tay nên đọc ref trong đó là hợp lệ. Thả tay mới `seek` — qua store để tới sink
 * của engine native.
 */
export function Scrubber() {
  const duration = usePlayer((s) => s.duration);
  const smoothTime = useSmoothTime();

  const widthRef = useRef(0);
  const dragRef = useRef<number | null>(null);
  /** Tỉ lệ đang kéo; null = không kéo, thanh tua chạy theo thời gian mượt. */
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const applyRatio = (x: number) => {
    const width = widthRef.current;
    const ratio = width > 0 ? Math.min(1, Math.max(0, x / width)) : 0;
    dragRef.current = ratio;
    setDragRatio(ratio);
  };

  const endDrag = (commit: boolean) => {
    const ratio = dragRef.current;
    dragRef.current = null;
    setDragRatio(null);
    if (!commit || ratio === null) return;
    const store = usePlayer.getState();
    store.seek(ratio * store.duration);
  };

  const shownTime = dragRatio === null ? smoothTime : dragRatio * duration;
  const ratio =
    dragRatio ?? (duration > 0 ? Math.min(1, smoothTime / duration) : 0);

  return (
    <>
      <View
        style={styles.scrubberHit}
        onLayout={(event: LayoutChangeEvent) => {
          widthRef.current = event.nativeEvent.layout.width;
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Thanh tua"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => applyRatio(event.nativeEvent.locationX)}
        onResponderMove={(event) => applyRatio(event.nativeEvent.locationX)}
        onResponderRelease={() => endDrag(true)}
        onResponderTerminate={() => endDrag(false)}
      >
        <View style={styles.scrubberTrack}>
          <View style={[styles.scrubberFill, { width: `${ratio * 100}%` }]} />
        </View>
        <View style={[styles.scrubberKnob, { left: `${ratio * 100}%` }]} />
      </View>

      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shownTime)}</Text>
        <Text style={styles.time}>
          {duration > 0 ? formatTime(duration) : "--:--"}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrubberHit: {
    height: 36,
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  scrubberTrack: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  scrubberFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  scrubberKnob: {
    position: "absolute",
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: radius.full,
    backgroundColor: colors.text,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: {
    color: colors.subtle,
    fontSize: font.xs,
    fontVariant: ["tabular-nums"],
  },
});
