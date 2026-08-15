import { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { accentText, colors, font, radius, spacing } from "@/theme";
import { useCurrentTrack, usePlayer } from "@/store/player";

/**
 * Màn hình phát toàn cảnh: ảnh bìa lớn, thanh tua kéo được, và cả hàng đợi.
 *
 * Mọi nút đều gọi store — engine native nghe store rồi mới ra tiếng. Không màn hình
 * nào được gọi thẳng `VongAudio`, nếu không trạng thái hiển thị và tiếng thật sẽ lệch.
 */

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

export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const track = useCurrentTrack();

  const isPlaying = usePlayer((s) => s.isPlaying);
  const isBuffering = usePlayer((s) => s.isBuffering);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const error = usePlayer((s) => s.error);
  const queue = usePlayer((s) => s.queue);
  const order = usePlayer((s) => s.order);
  const position = usePlayer((s) => s.position);

  /** Bề rộng thanh tua, đo bằng `onLayout`: hệ responder chỉ cho toạ độ pixel. */
  const widthRef = useRef(0);
  const dragRef = useRef<number | null>(null);
  /** Tỉ lệ đang kéo; null = không kéo, thanh tua chạy theo `currentTime`. */
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  // Dùng thẳng hệ responder của View chứ không qua `PanResponder`: `PanResponder.create`
  // phải chạy trong thân render (handler cần có sẵn lúc render để cắm vào view), tức là
  // đóng gói ref vào một hàm dựng giữa render — đúng thứ `react-hooks/refs` cấm, và cấm
  // có lý. Các hàm dưới đây là handler cảm ứng thật: chúng chỉ chạy khi có ngón tay, nên
  // đọc ref trong đó là hợp lệ.
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
    // Qua store: `seek` mới tới được sink của engine native.
    const store = usePlayer.getState();
    store.seek(ratio * store.duration);
  };

  if (!track) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Text style={styles.emptyText}>Chưa có bài nào trong hàng đợi.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={styles.closeLabel}>Đóng</Text>
        </Pressable>
      </View>
    );
  }

  const shownTime = dragRatio === null ? currentTime : dragRatio * duration;
  const ratio =
    dragRatio ?? (duration > 0 ? Math.min(1, currentTime / duration) : 0);

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng màn hình phát"
        onPress={() => router.back()}
        style={styles.closeButton}
      >
        <Text style={styles.closeLabel}>⌄</Text>
      </Pressable>

      {track.coverUrl ? (
        <Image
          source={{ uri: track.coverUrl }}
          style={styles.cover}
          contentFit="cover"
          transition={160}
        />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Text style={styles.coverGlyph}>♪</Text>
        </View>
      )}

      <Text style={styles.title} numberOfLines={2}>
        {track.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {track.artistName ?? "Không rõ nghệ sĩ"}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

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

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shuffle ? "Tắt xáo bài" : "Xáo bài"}
          onPress={() => usePlayer.getState().toggleShuffle()}
          style={styles.sideButton}
        >
          <Text style={[styles.sideGlyph, shuffle && styles.activeGlyph]}>
            ⇄
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bài trước"
          onPress={() => usePlayer.getState().previous()}
          style={styles.stepButton}
        >
          <Text style={styles.stepGlyph}>◀◀</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Tạm dừng" : "Phát"}
          onPress={() => usePlayer.getState().toggle()}
          style={styles.playButton}
        >
          <Text style={styles.playGlyph}>
            {isBuffering && isPlaying ? "…" : isPlaying ? "▮▮" : "▶"}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bài sau"
          onPress={() => usePlayer.getState().next()}
          style={styles.stepButton}
        >
          <Text style={styles.stepGlyph}>▶▶</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            repeat === "off"
              ? "Lặp: tắt"
              : repeat === "all"
                ? "Lặp: cả hàng đợi"
                : "Lặp: một bài"
          }
          onPress={() => usePlayer.getState().cycleRepeat()}
          style={styles.sideButton}
        >
          <Text
            style={[styles.sideGlyph, repeat !== "off" && styles.activeGlyph]}
          >
            {repeat === "one" ? "↻1" : "↻"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.queueHeading}>
        Hàng đợi · {order.length} bài
      </Text>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing.xl,
      }}
      data={order}
      keyExtractor={(queueIndex, orderPos) =>
        `${orderPos}:${queue[queueIndex]?.id ?? queueIndex}`
      }
      ListHeaderComponent={header}
      renderItem={({ item: queueIndex, index: orderPos }) => {
        const row = queue[queueIndex];
        if (!row) return null;
        const active = orderPos === position;
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => usePlayer.getState().playTrackAt(orderPos)}
            style={styles.queueRow}
          >
            <Text style={[styles.queueIndex, active && styles.activeGlyph]}>
              {active ? "▶" : String(orderPos + 1)}
            </Text>
            <View style={styles.queueMeta}>
              <Text
                style={[styles.queueTitle, active && styles.activeGlyph]}
                numberOfLines={1}
              >
                {row.title}
              </Text>
              <Text style={styles.queueArtist} numberOfLines={1}>
                {row.artistName ?? "Không rõ nghệ sĩ"}
              </Text>
            </View>
            <Text style={styles.queueTime}>
              {row.durationSec === null ? "" : formatTime(row.durationSec)}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  emptyText: {
    color: colors.muted,
    fontSize: font.md,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  closeButton: {
    alignSelf: "flex-start",
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeLabel: {
    color: colors.muted,
    fontSize: font.xl,
  },
  cover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.xl,
  },
  coverEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  coverGlyph: {
    color: colors.subtle,
    fontSize: font.xxl,
  },
  title: {
    color: colors.text,
    fontSize: font.xl,
    fontWeight: "700",
  },
  artist: {
    color: colors.muted,
    fontSize: font.md,
    marginTop: spacing.xs,
  },
  error: {
    color: colors.accent,
    fontSize: font.sm,
    marginTop: spacing.sm,
  },
  scrubberHit: {
    height: 36,
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  scrubberTrack: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
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
    backgroundColor: colors.accent,
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
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sideButton: {
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sideGlyph: {
    color: colors.muted,
    fontSize: font.lg,
  },
  activeGlyph: {
    color: colors.accent,
  },
  stepButton: {
    minWidth: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: {
    color: colors.text,
    fontSize: font.lg,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  playGlyph: {
    color: accentText,
    fontSize: font.lg,
  },
  queueHeading: {
    color: colors.subtle,
    fontSize: font.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  queueIndex: {
    width: 24,
    textAlign: "center",
    color: colors.subtle,
    fontSize: font.sm,
  },
  queueMeta: {
    flex: 1,
  },
  queueTitle: {
    color: colors.text,
    fontSize: font.sm,
  },
  queueArtist: {
    color: colors.muted,
    fontSize: font.xs,
    marginTop: 2,
  },
  queueTime: {
    color: colors.subtle,
    fontSize: font.xs,
    fontVariant: ["tabular-nums"],
  },
});
