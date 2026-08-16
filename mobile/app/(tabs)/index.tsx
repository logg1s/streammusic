import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { PlayableTrack } from "@vong/shared";
import { ALBUM_CARD_WIDTH, AlbumCard, ArtistRow } from "@/components/album-card";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Readout,
  Screen,
} from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import { TrackRow } from "@/components/track-row";
import { formatLibraryStats } from "@/lib/format";
import type {
  ArtistList,
  LibraryHome,
  TrackList,
  YoutubeSections,
} from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { colors, font, spacing } from "@/theme";

/** Số dòng hiện trong một dải ở trang chủ — bấm vào vẫn phát cả dải. */
const ROWS = 6;
const YT_SECTIONS = 4;
const YT_ROWS = 5;

/**
 * Trang chủ: phần thư viện trước, gợi ý YouTube sau.
 *
 * Bốn endpoint gọi song song bằng bốn `useApi` độc lập — chủ ý: `/api/youtube/home`
 * phải đi qua InnerTube nên hay hỏng hoặc chậm, và nó hỏng thì phần thư viện vẫn phải
 * hiện đủ. Đó cũng là lý do không gộp thành một `Promise.all`.
 */
export default function HomeScreen() {
  const router = useRouter();
  const home = useApi<LibraryHome>("/api/library/home");
  const artists = useApi<ArtistList>("/api/library/artists");
  const ytHome = useApi<YoutubeSections>("/api/youtube/home");
  const trending = useApi<TrackList>("/api/youtube/trending");

  function reloadAll() {
    home.reload();
    artists.reload();
    ytHome.reload();
    trending.reload();
  }

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
        <ErrorNote message={home.error} onRetry={reloadAll} />
      </Screen>
    );
  }

  const data = home.data;
  if (data === null) return null;

  const empty =
    data.stats.trackCount === 0 &&
    data.played.length === 0 &&
    data.recent.length === 0;

  return (
    <Screen scroll refreshing={home.loading} onRefresh={reloadAll}>
      <Readout text={formatLibraryStats(data.stats)} />

      {empty ? (
        <EmptyNote
          title="Thư viện còn trống"
          hint="Nhạc của bạn vẫn nằm nguyên trên Drive, Dropbox hay OneDrive. Vào Cài đặt để nối một tài khoản, hoặc tìm thẳng bài trên YouTube ở tab Tìm kiếm."
        />
      ) : null}

      <TrackSection label="Vừa nghe" tracks={data.played} limit={ROWS} radioOnTap />
      <TrackSection label="Mới thêm vào" tracks={data.recent} limit={ROWS} />

      {data.albums.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            label="Album"
            actionLabel="Xem tất cả"
            onAction={() => router.push("/albums")}
          />
          <FlatList
            data={data.albums.slice(0, 12)}
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
            label="Nghệ sĩ"
            actionLabel="Xem tất cả"
            onAction={() => router.push("/artists")}
          />
          {artists.data.artists.slice(0, 5).map((artist) => (
            <ArtistRow key={artist.id} artist={artist} />
          ))}
        </View>
      ) : null}

      {trending.data && trending.data.tracks.length > 0 ? (
        <TrackSection
          label="Đang thịnh hành"
          tracks={trending.data.tracks}
          limit={ROWS}
          radioOnTap
        />
      ) : null}

      {ytHome.data
        ? ytHome.data.sections
            .slice(0, YT_SECTIONS)
            .map((section) => (
              <TrackSection
                key={section.title}
                label={section.title}
                tracks={section.tracks}
                limit={YT_ROWS}
                radioOnTap
              />
            ))
        : null}

      {ytHome.error !== null && trending.error !== null ? (
        <Text style={styles.ytError}>
          Chưa lấy được gợi ý từ YouTube. Phần thư viện vẫn dùng bình thường.
        </Text>
      ) : null}
    </Screen>
  );
}

/**
 * Một dải bài.
 *
 * `tracks` truyền xuống `TrackRow` là **cả dải**, không phải phần đã cắt: bấm dòng thứ
 * ba của "Vừa nghe" thì phát tiếp tới hết dải, kể cả những bài chưa hiện ra.
 */
function TrackSection({
  label,
  tracks,
  limit,
  radioOnTap = false,
}: {
  label: string;
  tracks: PlayableTrack[];
  limit: number;
  radioOnTap?: boolean;
}) {
  if (tracks.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader label={label} />
      {tracks.slice(0, limit).map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          tracks={tracks}
          index={index}
          radioOnTap={radioOnTap}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xxl,
  },
  gap: {
    width: spacing.md,
  },
  ytError: {
    color: colors.subtle,
    fontSize: font.xs,
    marginBottom: spacing.xl,
  },
});
