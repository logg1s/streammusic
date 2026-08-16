import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Readout,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { formatNumber } from "@/lib/format";
import type { PlaylistList, PlaylistRow } from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { colors, font, spacing } from "@/theme";

/**
 * Playlist đã lưu.
 *
 * Không có nút tạo mới ở đây, và cũng chưa có ở bất kỳ đâu trong app Android: `POST
 * /api/playlists` đòi cả danh sách bài kèm theo (nó lưu hàng đợi đang phát), mà vỏ này
 * hiện chỉ đọc — `src/lib/api.ts` không gửi request ghi nào ngoài lúc đăng nhập. Vì vậy
 * trạng thái rỗng chỉ đường sang web/máy tính chứ không chỉ sang màn hình phát.
 */
export default function PlaylistsScreen() {
  const { data, error, loading, reload } = useApi<PlaylistList>("/api/playlists");
  const content = useContentInsets();

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

  return (
    <Screen>
      <FlatList
        data={data.playlists}
        keyExtractor={(playlist) => playlist.id}
        renderItem={({ item }) => <PlaylistListRow playlist={item} />}
        contentContainerStyle={content}
        ListHeaderComponent={
          data.playlists.length > 0 ? (
            <Readout
              text={`${formatNumber(data.playlists.length)} playlist`}
            />
          ) : null
        }
        ListEmptyComponent={
          <EmptyNote
            title="Chưa có playlist nào"
            hint="Lưu hàng đợi thành playlist trên bản web hoặc máy tính."
          />
        }
      />
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
