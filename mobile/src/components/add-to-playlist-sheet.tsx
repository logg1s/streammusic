import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlayableTrack } from "@vong/shared";
import type { PlaylistList, PlaylistRow } from "@/lib/dto";
import { formatNumber } from "@/lib/format";
import { addToPlaylist, createPlaylist } from "@/lib/playlist-actions";
import { errorMessage, useApi } from "@/lib/use-api";
import { colors, font, onAccent, radius, spacing } from "@/theme";

/**
 * Hộp "thêm bài vào playlist", mở bằng cách nhấn giữ một dòng bài.
 *
 * Chỉ được mount khi đã mở: mỗi danh sách có hàng chục `TrackRow`, dựng sẵn hộp cho tất
 * cả là hàng chục `Modal` và hàng chục lượt gọi `/api/playlists` vô ích.
 *
 * Ô "tạo playlist mới" nằm luôn trong hộp thay vì mở thêm một `Modal` nữa — Modal lồng
 * Modal trên Android hay kẹt bàn phím.
 */
export function AddToPlaylistSheet({
  track,
  onClose,
}: {
  track: PlayableTrack;
  onClose: () => void;
}) {
  const { data, error, loading, reload } = useApi<PlaylistList>("/api/playlists");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** Một dòng trạng thái duy nhất cho cả thêm lẫn tạo — hộp nhỏ, hai chỗ báo là rối. */
  const [message, setMessage] = useState<string | null>(null);

  const playlists = data?.playlists ?? [];
  const trimmed = name.trim();

  const add = async (playlist: PlaylistRow) => {
    if (busy) return;
    setBusy(true);
    setMessage("Đang thêm…");
    try {
      const added = await addToPlaylist(playlist.id, [track.id]);
      setMessage(
        added === 0
          ? "Bài đã có trong playlist"
          : `Đã thêm vào ${playlist.name}`,
      );
      reload();
    } catch (cause) {
      setMessage(errorMessage(cause));
    }
    setBusy(false);
  };

  /** Playlist mới lấy luôn bài đang chọn làm bài đầu tiên — server không nhận playlist trắng. */
  const create = async () => {
    if (busy || trimmed.length === 0) return;
    setBusy(true);
    setMessage("Đang tạo…");
    try {
      await createPlaylist(trimmed, [track.id]);
      setMessage(`Đã tạo ${trimmed}`);
      setName("");
      reload();
    } catch (cause) {
      setMessage(errorMessage(cause));
    }
    setBusy(false);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => undefined}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Thêm vào playlist</Text>
              <Text numberOfLines={1} style={styles.trackTitle}>
                {track.title}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.inline}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.hint}>Đang tải…</Text>
            </View>
          ) : null}

          {error !== null ? <Text style={styles.error}>{error}</Text> : null}

          {!loading && error === null && playlists.length === 0 ? (
            <Text style={styles.hint}>
              Chưa có playlist nào — đặt tên bên dưới để tạo cái đầu tiên.
            </Text>
          ) : null}

          {playlists.length > 0 ? (
            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {playlists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  accessibilityRole="button"
                  onPress={() => void add(playlist)}
                  style={({ pressed }) => [
                    styles.listRow,
                    pressed && styles.listRowPressed,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.listName}>
                    {playlist.name}
                  </Text>
                  <Text style={styles.listCount}>
                    {formatNumber(playlist.itemCount)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.createRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Tạo playlist mới…"
              placeholderTextColor={colors.subtle}
              style={styles.input}
              editable={!busy}
              returnKeyType="done"
              selectionColor={colors.accent}
              onSubmitEditing={() => void create()}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void create()}
              disabled={busy || trimmed.length === 0}
              style={({ pressed }) => [
                styles.createButton,
                (busy || trimmed.length === 0) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.createLabel}>Tạo</Text>
            </Pressable>
          </View>

          {message !== null ? (
            <Text style={styles.message}>{message}</Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  panel: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: colors.subtle,
    fontSize: font.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  trackTitle: {
    color: colors.text,
    fontSize: font.md,
  },
  list: {
    maxHeight: 240,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listRowPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  listName: {
    flex: 1,
    color: colors.text,
    fontSize: font.sm,
  },
  listCount: {
    color: colors.subtle,
    fontSize: font.xs,
    fontVariant: ["tabular-nums"],
  },
  createRow: {
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: font.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  createButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  createLabel: {
    color: onAccent,
    fontSize: font.sm,
    fontWeight: "700",
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  hint: {
    color: colors.subtle,
    fontSize: font.sm,
  },
  error: {
    color: colors.danger,
    fontSize: font.sm,
  },
  message: {
    color: colors.muted,
    fontSize: font.xs,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
});
