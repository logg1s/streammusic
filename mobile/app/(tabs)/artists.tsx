import { FlatList } from "react-native";
import { ArtistRow } from "@/components/album-card";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Readout,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { formatNumber } from "@/lib/format";
import type { ArtistList } from "@/lib/dto";
import { useApi } from "@/lib/use-api";

/**
 * Danh sách nghệ sĩ. Không có ô trên thanh tab (xem `(tabs)/_layout.tsx`) — vào từ dải
 * "Nghệ sĩ" ở trang chủ hoặc từ chi tiết album.
 */
export default function ArtistsScreen() {
  const { data, error, loading, reload } = useApi<ArtistList>(
    "/api/library/artists",
  );
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
        data={data.artists}
        keyExtractor={(artist) => artist.id}
        renderItem={({ item }) => <ArtistRow artist={item} />}
        contentContainerStyle={content}
        ListHeaderComponent={
          data.artists.length > 0 ? (
            <Readout text={`${formatNumber(data.artists.length)} nghệ sĩ`} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyNote
            title="Chưa có nghệ sĩ nào"
            hint="Quét một thư mục nhạc để app đọc thẻ metadata và dựng danh sách."
          />
        }
      />
    </Screen>
  );
}
