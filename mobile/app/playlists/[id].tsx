import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { FlatList } from "react-native";
import { DetailHeader } from "@/components/detail-header";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { TRACK_ROW_HEIGHT, TrackRow } from "@/components/track-row";
import { formatLongDuration, formatNumber } from "@/lib/format";
import type { PlaylistDetail } from "@/lib/dto";
import { useApi } from "@/lib/use-api";

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<PlaylistDetail>(
    `/api/playlists/${id}`,
  );
  const content = useContentInsets();

  // `items` mang thêm `itemId` (khoá của dòng trong playlist) mà player không cần;
  // memo để `TrackRow` không nhận mảng mới sau mỗi lần render và mất `memo`.
  const tracks = useMemo(
    () => (data === null ? [] : data.items.map((item) => item.track)),
    [data],
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

  const totalSeconds = tracks.reduce(
    (sum, track) => sum + (track.durationSec ?? 0),
    0,
  );
  const subtitle = [
    data.playlist.seedLabel,
    `${formatNumber(tracks.length)} bài`,
    formatLongDuration(totalSeconds),
  ]
    .filter((part): part is string => part !== null)
    .join("  ·  ");

  return (
    <Screen>
      <Stack.Screen options={{ title: data.playlist.name }} />
      <FlatList
        data={tracks}
        keyExtractor={(track) => track.id}
        renderItem={({ item, index }) => (
          <TrackRow track={item} tracks={tracks} index={index} />
        )}
        contentContainerStyle={content}
        getItemLayout={(_, index) => ({
          length: TRACK_ROW_HEIGHT,
          offset: TRACK_ROW_HEIGHT * index,
          index,
        })}
        ListHeaderComponent={
          <DetailHeader
            coverUrl={tracks[0]?.coverUrl ?? null}
            title={data.playlist.name}
            subtitle={subtitle}
            tracks={tracks}
          />
        }
        ListEmptyComponent={
          <EmptyNote
            title="Playlist này đang trống"
            hint="Lưu hàng đợi thành playlist trên bản web hoặc máy tính."
          />
        }
      />
    </Screen>
  );
}
