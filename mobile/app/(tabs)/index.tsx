import { useRouter, type Href } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlayableTrack } from "@vong/shared";
import { ALBUM_CARD_WIDTH, AlbumCard, ArtistRow } from "@/components/album-card";
import { Artwork } from "@/components/artwork";
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
import { startRadioFor } from "@/lib/radio-engine";
import type {
  ArtistList,
  LibraryHome,
  TrackList,
  YoutubeSections,
} from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { usePlayer } from "@/store/player";
import { colors, font, radius, spacing } from "@/theme";

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
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>DÀNH CHO BẠN</Text>
        <Text style={styles.heroTitle}>Chào bạn</Text>
        <Text style={styles.heroText}>
          Nhạc của bạn và danh sách kết hợp do YouTube đề xuất.
        </Text>
        <Readout text={formatLibraryStats(data.stats)} />
      </View>

      <QuickGrid tracks={data.played} />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/favorites" as Href)}
        style={({ pressed }) => [styles.favoriteLink, pressed && styles.pressed]}
      >
        <Ionicons name="heart" size={18} color={colors.accent} />
        <Text style={styles.favoriteText}>Yêu thích</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.muted} />
      </Pressable>

      {empty ? (
        <EmptyNote
          title="Thư viện còn trống"
          hint="Nhạc của bạn vẫn nằm nguyên trên Drive, Dropbox hay OneDrive. Vào Cài đặt để nối một tài khoản, hoặc tìm thẳng bài trên YouTube ở tab Tìm kiếm."
        />
      ) : null}

      <TrackSection label="Nghe gần đây" tracks={data.played} limit={ROWS} radioOnTap />
      <TrackSection label="Vừa thêm vào" tracks={data.recent} limit={ROWS} />

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

function QuickGrid({ tracks }: { tracks: PlayableTrack[] }) {
  const shown = tracks.slice(0, 6);
  if (shown.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader label="Nghe tiếp" />
      <View style={styles.quickGrid}>
        {shown.map((track, index) => (
          <Pressable
            key={track.id}
            accessibilityRole="button"
            accessibilityLabel={`Phát ${track.title}`}
            onPress={() => {
              if (track.source === "youtube") void startRadioFor(track);
              else usePlayer.getState().playQueue(shown, index);
            }}
            style={({ pressed }) => [
              styles.quickItem,
              pressed && styles.pressed,
            ]}
          >
            <Artwork url={track.coverUrl} name={track.title} size={52} rounded="sm" />
            <Text numberOfLines={2} style={styles.quickTitle}>
              {track.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Một dải bài.
 *
 * `tracks` truyền xuống `TrackRow` là **cả dải**, không phải phần đã cắt: bấm dòng thứ
 * ba của "Nghe gần đây" thì phát tiếp tới hết dải, kể cả những bài chưa hiện ra.
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
  hero: {
    overflow: "hidden",
    marginBottom: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  heroEyebrow: {
    color: colors.accentText,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  heroTitle: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: font.xxl,
    fontWeight: "800",
  },
  heroText: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    color: colors.muted,
    fontSize: font.sm,
    lineHeight: 20,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  quickItem: {
    width: "48.5%",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  quickTitle: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontSize: font.xs,
    fontWeight: "700",
  },
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
  favoriteLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  favoriteText: {
    flex: 1,
    color: colors.text,
    fontSize: font.sm,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.65,
  },
});
