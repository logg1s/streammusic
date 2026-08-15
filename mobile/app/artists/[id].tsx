import { Stack, useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";
import { ALBUM_CARD_WIDTH, AlbumCard } from "@/components/album-card";
import { DetailHeader } from "@/components/detail-header";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Screen,
} from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import { TrackRow } from "@/components/track-row";
import { formatNumber } from "@/lib/format";
import type { ArtistDetail } from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { spacing } from "@/theme";

/**
 * Chi tiết nghệ sĩ: album trước, rồi bài lẻ (bài không gắn album nào).
 *
 * Nút ở đầu trang phát `singles`, vì đó là danh sách bài duy nhất endpoint này trả về
 * — bài nằm trong album thì mở album ra phát, khỏi nạp lại toàn bộ đĩa nhạc.
 */
export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<ArtistDetail>(
    `/api/library/artists/${id}`,
  );

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

  const { artist, albums, singles } = data;
  const subtitle = [
    `${formatNumber(albums.length)} album`,
    `${formatNumber(singles.length)} bài lẻ`,
  ].join("  ·  ");

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: artist.name }} />

      <DetailHeader
        coverUrl={albums[0]?.coverUrl ?? null}
        title={artist.name}
        subtitle={subtitle}
        tracks={singles}
        round={albums.length === 0}
        actionLabel={albums.length > 0 ? "Phát bài lẻ" : "Phát tất cả"}
      />

      {albums.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader label="Album" />
          <FlatList
            data={albums}
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

      {singles.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader label="Bài lẻ" />
          {singles.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              tracks={singles}
              index={index}
            />
          ))}
        </View>
      ) : null}

      {albums.length === 0 && singles.length === 0 ? (
        <EmptyNote
          title="Chưa có bài nào của nghệ sĩ này"
          hint="Quét lại thư mục nhạc nếu bạn vừa thêm file mới."
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xxl,
  },
  gap: {
    width: spacing.md,
  },
});
