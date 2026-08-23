import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Artwork } from "@/components/artwork";
import { usePlayer } from "@/store/player";
import { colors, font, radius, spacing } from "@/theme";

function formatTime(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function QueueSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const queue = usePlayer((state) => state.queue);
  const order = usePlayer((state) => state.order);
  const position = usePlayer((state) => state.position);
  const radio = usePlayer((state) => state.radio);

  const items = useMemo(
    () =>
      order
        .map((queueIndex, orderPosition) => ({
          orderPosition,
          track: queue[queueIndex],
        }))
        .filter(
          (
            item,
          ): item is {
            orderPosition: number;
            track: NonNullable<typeof item.track>;
          } => Boolean(item.track),
        ),
    [order, queue],
  );
  const current = items.find((item) => item.orderPosition === position) ?? null;
  const upcoming = items.filter((item) => item.orderPosition > position);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Android renders Modal in a separate native root. The app-level gesture
          root cannot reach it, so the draggable list needs a root inside here. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng hàng đợi"
            onPress={onClose}
            style={styles.backdrop}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel="Hàng đợi phát"
            style={styles.sheet}
          >
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.heading}>Hàng đợi</Text>
                <Text style={styles.count}>
                  {upcoming.length > 0
                    ? `Còn ${upcoming.length} bài phía sau`
                    : "Đây là bài cuối trong hàng đợi"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>

            {radio ? (
              <View style={styles.radioRow}>
                <Ionicons name="radio" size={20} color={colors.accent} />
                <Text style={styles.radioLabel} numberOfLines={1}>
                  Radio · {radio.seedLabel}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dừng radio"
                  onPress={() => usePlayer.getState().stopRadio()}
                  style={({ pressed }) => [
                    styles.textButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.textButtonLabel}>Dừng</Text>
                </Pressable>
              </View>
            ) : null}

            {current ? (
              <View style={styles.currentSection}>
                <Text style={styles.sectionLabel}>Đang phát</Text>
                <QueueRow item={current} current />
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Tiếp theo</Text>
            <DraggableFlatList
              data={upcoming}
              keyExtractor={(item) => `${item.orderPosition}:${item.track.id}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              activationDistance={8}
              autoscrollThreshold={56}
              onDragEnd={({ from, to }) => {
                if (from !== to) {
                  usePlayer
                    .getState()
                    .moveUpcoming(position + 1 + from, position + 1 + to);
                }
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>Chưa có bài nào ở phía sau.</Text>
              }
              renderItem={(params) => <UpcomingQueueRow {...params} />}
            />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function UpcomingQueueRow(
  props: RenderItemParams<{
    orderPosition: number;
    track: ReturnType<typeof usePlayer.getState>["queue"][number];
  }>,
) {
  return (
    <ScaleDecorator activeScale={1.015}>
      <QueueRow {...props} />
    </ScaleDecorator>
  );
}

function QueueRow({
  item,
  current = false,
  drag,
  isActive = false,
}: {
  item: {
    orderPosition: number;
    track: ReturnType<typeof usePlayer.getState>["queue"][number];
  };
  current?: boolean;
  drag?: () => void;
  isActive?: boolean;
}) {
  return (
    <View style={[styles.queueRow, current && styles.queueRowCurrent]}>
      {!current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Kéo ${item.track.title} để đổi thứ tự hàng đợi`}
          accessibilityHint="Chạm tay nắm, kéo lên hoặc xuống rồi thả"
          disabled={isActive}
          onPressIn={drag}
          style={({ pressed }) => [
            styles.dragButton,
            isActive && styles.dragButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="reorder-three" size={24} color={colors.subtle} />
        </Pressable>
      ) : (
        <View style={styles.playingMark}>
          <Ionicons name="stats-chart" size={18} color={colors.accent} />
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Phát ${item.track.title}`}
        onPress={() => usePlayer.getState().playTrackAt(item.orderPosition)}
        style={({ pressed }) => [styles.trackButton, pressed && styles.pressed]}
      >
        <Artwork
          url={item.track.coverUrl}
          name={item.track.title}
          size={48}
          rounded="sm"
        />
        <View style={styles.trackMeta}>
          <Text
            numberOfLines={1}
            style={[styles.trackTitle, current && styles.currentTitle]}
          >
            {item.track.title}
          </Text>
          <Text numberOfLines={1} style={styles.trackArtist}>
            {item.track.artistName ?? "Không rõ nghệ sĩ"}
          </Text>
        </View>
        <Text style={styles.duration}>
          {formatTime(item.track.durationSec)}
        </Text>
      </Pressable>

      {!current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Phát tiếp: ${item.track.title}`}
          accessibilityHint="Đưa bài này lên ngay sau bài đang phát"
          onPress={() => usePlayer.getState().moveToNext(item.orderPosition)}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="play-skip-forward" size={20} color={colors.muted} />
        </Pressable>
      ) : null}

      {!current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Bỏ khỏi hàng đợi: ${item.track.title}`}
          onPress={() => usePlayer.getState().removeAt(item.orderPosition)}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="close" size={21} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  sheet: {
    maxHeight: "82%",
    minHeight: "64%",
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  grabber: {
    alignSelf: "center",
    width: 48,
    height: 4,
    marginBottom: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.subtle,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerCopy: { flex: 1 },
  heading: { color: colors.text, fontSize: font.xxl, fontWeight: "800" },
  count: { marginTop: spacing.xs, color: colors.muted, fontSize: font.sm },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  radioRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  radioLabel: { flex: 1, color: colors.muted, fontSize: font.sm },
  textButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  textButtonLabel: {
    color: colors.accentText,
    fontSize: font.sm,
    fontWeight: "700",
  },
  currentSection: { marginBottom: spacing.lg },
  sectionLabel: {
    marginBottom: spacing.sm,
    color: colors.muted,
    fontSize: font.sm,
    fontWeight: "700",
  },
  listContent: { paddingBottom: spacing.xl },
  queueRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
  },
  queueRowCurrent: {
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceElevated,
  },
  dragButton: {
    width: 40,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  dragButtonActive: { opacity: 0.62 },
  playingMark: { width: 36, alignItems: "center" },
  trackButton: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  trackMeta: { flex: 1, minWidth: 0 },
  trackTitle: { color: colors.text, fontSize: font.md, fontWeight: "600" },
  currentTitle: { color: colors.accentText },
  trackArtist: { marginTop: 3, color: colors.muted, fontSize: font.xs },
  duration: {
    marginLeft: spacing.sm,
    color: colors.subtle,
    fontSize: font.xs,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    paddingVertical: spacing.xl,
    color: colors.subtle,
    fontSize: font.sm,
  },
  pressed: { opacity: 0.62 },
});
