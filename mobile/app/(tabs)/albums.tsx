import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { AlbumCard } from "@/components/album-card";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Readout,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { formatNumber } from "@/lib/format";
import type { AlbumList } from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { spacing } from "@/theme";

const COLUMNS = 2;

export default function AlbumsScreen() {
  const { data, error, loading, reload } = useApi<AlbumList>(
    "/api/library/albums",
  );
  const content = useContentInsets();
  const { width } = useWindowDimensions();

  // Bề rộng thẻ tính từ bề rộng máy: ảnh bìa vuông nên chiều cao đi theo, và hai cột
  // luôn vừa khít bất kể máy 5" hay tablet.
  const cardWidth =
    (width - spacing.lg * 2 - spacing.md * (COLUMNS - 1)) / COLUMNS;

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
        data={data.albums}
        keyExtractor={(album) => album.id}
        renderItem={({ item }) => (
          <AlbumCard album={item} width={cardWidth} />
        )}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={content}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={
          data.albums.length > 0 ? (
            <Readout text={`${formatNumber(data.albums.length)} album`} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyNote
            title="Chưa có album nào"
            hint="Album được dựng từ thẻ metadata của file, nên hãy quét một thư mục nhạc trước."
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
  },
  gap: {
    height: spacing.xl,
  },
});
