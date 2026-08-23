import { useRouter, type Href } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ALBUM_CARD_WIDTH, AlbumCard, ArtistRow } from "@/components/album-card";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Readout,
  Screen,
} from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import { formatLibraryStats } from "@/lib/format";
import type { ArtistList, LibraryHome } from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { colors, font, spacing } from "@/theme";

/**
 * Điểm vào chung của các bộ sưu tập. Những tab con vẫn giữ route riêng để người nghe
 * đi thẳng từ link sâu, nhưng tab Thư viện không còn ép họ mở danh sách bài trước.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const home = useApi<LibraryHome>("/api/library/home");
  const artists = useApi<ArtistList>("/api/library/artists");

  const reload = () => {
    home.reload();
    artists.reload();
  };

  if (home.loading && home.data === null) {
    return (
      <Screen scroll>
        <Loading />
      </Screen>
    );
  }

  if (home.error !== null && home.data === null) {
    return (
      <Screen scroll>
        <ErrorNote message={home.error} onRetry={reload} />
      </Screen>
    );
  }

  if (home.data === null) return null;
  const data = home.data;
  const empty = data.stats.trackCount === 0;

  return (
    <Screen scroll refreshing={home.loading} onRefresh={reload}>
      <View style={styles.shortcuts}>
        <LibraryShortcut icon="disc-outline" label="Album" onPress={() => router.push("/albums")} />
        <LibraryShortcut icon="people-outline" label="Nghệ sĩ" onPress={() => router.push("/artists")} />
        <LibraryShortcut icon="musical-notes-outline" label="Bài hát" onPress={() => router.push("/tracks")} />
        <LibraryShortcut icon="heart-outline" label="Yêu thích" onPress={() => router.push("/favorites" as Href)} />
        <LibraryShortcut icon="list-outline" label="Playlist" onPress={() => router.push("/playlists")} />
      </View>
      {!empty ? <Readout text={formatLibraryStats(data.stats)} /> : null}
      {empty ? (
        <EmptyNote
          title="Thư viện còn trống"
          hint="Vào Cài đặt, nối một kho lưu trữ rồi quét thư mục nhạc để bắt đầu."
        />
      ) : null}
      {data.albums.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            label="Album gần đây"
            actionLabel="Xem tất cả"
            onAction={() => router.push("/albums")}
          />
          <FlatList
            data={data.albums.slice(0, 8)}
            keyExtractor={(album) => album.id}
            renderItem={({ item }) => <AlbumCard album={item} />}
            horizontal
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.gap} />}
            getItemLayout={(_, index) => ({
              length: ALBUM_CARD_WIDTH + spacing.md,
              offset: (ALBUM_CARD_WIDTH + spacing.md) * index,
              index,
            })}
          />
        </View>
      ) : null}
      {artists.data && artists.data.artists.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            label="Nghệ sĩ trong thư viện"
            actionLabel="Xem tất cả"
            onAction={() => router.push("/artists")}
          />
          {artists.data.artists.slice(0, 6).map((artist) => (
            <ArtistRow key={artist.id} artist={artist} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function LibraryShortcut({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={colors.accentText} />
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  shortcut: {
    flexGrow: 1,
    minWidth: "28%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  shortcutText: {
    color: colors.text,
    fontSize: font.xs,
    fontWeight: "700",
  },
  section: {
    marginTop: spacing.xxl,
  },
  gap: {
    width: spacing.md,
  },
  pressed: {
    opacity: 0.65,
  },
});
