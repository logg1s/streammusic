import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Readout,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { TextPrompt } from "@/components/text-prompt";
import { formatNumber } from "@/lib/format";
import type { PlaylistList, PlaylistRow } from "@/lib/dto";
import { createPlaylist } from "@/lib/playlist-actions";
import { useApi } from "@/lib/use-api";
import { usePlayer } from "@/store/player";
import { colors, font, onAccent, radius, spacing } from "@/theme";

/**
 * Playlist đã lưu.
 *
 * Tạo mới ở đây là LƯU HÀNG ĐỢI ĐANG PHÁT, không phải dựng một playlist trắng: `POST
 * /api/playlists` đòi kèm danh sách bài và từ chối tập rỗng. Vì vậy nút chỉ hiện khi
 * hàng đợi có bài; muốn thêm từng bài thì nhấn giữ một dòng bài bất kỳ.
 */
export default function PlaylistsScreen() {
  const { data, error, loading, reload } = useApi<PlaylistList>("/api/playlists");
  const content = useContentInsets();
  const [naming, setNaming] = useState(false);
  const queueLength = usePlayer((state) => state.queue.length);
  const seedLabel = usePlayer((state) => state.radio?.seedLabel ?? null);

  // Playlist được tạo ở màn khác (nhấn giữ một dòng bài → thêm vào playlist), nên tab này
  // phải tải lại mỗi lần quay lại focus — nếu không playlist mới không hiện cho tới khi mở
  // lại app. Bỏ qua lần focus đầu vì effect gắn kết đã tự gọi một lượt lúc mount.
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (mounted.current) reload();
      else mounted.current = true;
    }, [reload]),
  );

  const save = async (name: string) => {
    // Lấy theo `order` chứ không phải `queue`: đó mới là thứ tự người nghe đang nghe.
    const { queue, order } = usePlayer.getState();
    const ids = order
      .map((position) => queue[position]?.id)
      .filter((id): id is string => typeof id === "string");
    await createPlaylist(name, ids, seedLabel);
    reload();
  };

  if (loading && data === null) {
    return (
      <Screen scroll>
        <Loading />
      </Screen>
    );
  }

  if (error !== null && data === null) {
    return (
      <Screen scroll>
        <ErrorNote message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (data === null) return null;

  const saveButton =
    queueLength > 0 ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => setNaming(true)}
        style={({ pressed }) => [styles.save, pressed && styles.savePressed]}
      >
        <Ionicons name="add" size={16} color={onAccent} />
        <Text style={styles.saveLabel}>Lưu hàng đợi thành playlist</Text>
      </Pressable>
    ) : null;

  return (
    <Screen>
      <FlatList
        data={data.playlists}
        keyExtractor={(playlist) => playlist.id}
        renderItem={({ item }) => <PlaylistListRow playlist={item} />}
        contentContainerStyle={content}
        ListHeaderComponent={
          data.playlists.length > 0 ? (
            <View style={styles.header}>
              <Readout
                text={`${formatNumber(data.playlists.length)} playlist`}
              />
              <View style={styles.headerAction}>{saveButton}</View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyNote
            title="Chưa có playlist nào"
            hint={
              queueLength > 0
                ? "Lưu hàng đợi đang phát thành playlist đầu tiên."
                : "Phát vài bài rồi lưu hàng đợi, hoặc nhấn giữ một dòng bài để thêm vào playlist."
            }
            action={saveButton}
          />
        }
      />

      {naming ? (
        <TextPrompt
          title="Lưu hàng đợi thành playlist"
          hint={`${formatNumber(queueLength)} bài trong hàng đợi`}
          placeholder="Tên playlist"
          initialValue={seedLabel === null ? "Hàng đợi" : `Radio · ${seedLabel}`}
          confirmLabel="Lưu"
          onSubmit={save}
          onClose={() => setNaming(false)}
        />
      ) : null}
    </Screen>
  );
}

function PlaylistListRow({ playlist }: { playlist: PlaylistRow }) {
  const router = useRouter();
  const created = new Date(playlist.createdAt);
  const day = String(created.getDate()).padStart(2, "0");
  const month = String(created.getMonth() + 1).padStart(2, "0");

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/playlists/[id]", params: { id: playlist.id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>
          {playlist.name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {[
            `${formatNumber(playlist.itemCount)} bài`,
            playlist.seedLabel ?? `Tạo ngày ${day}/${month}/${created.getFullYear()}`,
          ].join("  ·  ")}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
  },
  headerAction: {
    alignItems: "flex-start",
  },
  save: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  savePressed: {
    opacity: 0.75,
  },
  saveLabel: {
    color: onAccent,
    fontSize: font.sm,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: font.md,
  },
  meta: {
    color: colors.subtle,
    fontSize: font.xs,
  },
  chevron: {
    color: colors.subtle,
    fontSize: font.lg,
  },
});
