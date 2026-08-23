import { useRouter, type Href } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { findNewReleaseSection, type PlayableTrack } from "@vong/shared";
import { ALBUM_CARD_WIDTH, AlbumCard, ArtistRow } from "@/components/album-card";
import { Artwork } from "@/components/artwork";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Screen,
} from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import { TrackRow } from "@/components/track-row";
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
  const release = findNewReleaseSection(ytHome.data?.sections ?? []);

  const empty =
    data.stats.trackCount === 0 &&
    data.played.length === 0 &&
    data.recent.length === 0;

  return (
    <Screen scroll refreshing={home.loading} onRefresh={reloadAll}>
      <EditorialHero
        track={release?.tracks[0] ?? data.played[0] ?? data.recent[0]}
        context={release?.tracks ?? data.played}
      />

      {release ? <ReleaseRail tracks={release.tracks} /> : null}

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
            .filter((section) => section !== release)
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

function EditorialHero({
  track,
  context,
}: {
  track: PlayableTrack | undefined;
  context: PlayableTrack[];
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroTitle}>Âm nhạc dành cho bạn</Text>
      {track ? (
        <View style={styles.heroContent}>
          <Artwork url={track.coverUrl} name={track.title} size={104} rounded="lg" />
          <View style={styles.heroDetails}>
            <Text numberOfLines={2} style={styles.heroTrack}>{track.title}</Text>
            <Text numberOfLines={1} style={styles.heroArtist}>
              {track.artistName ?? "YouTube Music"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Phát ${track.title}`}
              onPress={() => {
                const index = Math.max(0, context.findIndex((item) => item.id === track.id));
                if (track.source === "youtube") void startRadioFor(track);
                else usePlayer.getState().playQueue(context, index);
              }}
              style={({ pressed }) => [styles.heroPlay, pressed && styles.pressed]}
            >
              <Ionicons name="play" size={20} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.heroText}>
          Nối kho nhạc hoặc tìm kiếm một bài hát để bắt đầu phiên nghe mới.
        </Text>
      )}
    </View>
  );
}

function ReleaseRail({ tracks }: { tracks: PlayableTrack[] }) {
  return (
    <View style={styles.section}>
      <SectionHeader label="Mới phát hành" />
      <FlatList
        data={tracks.slice(0, 12)}
        keyExtractor={(track) => track.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Phát ${item.title}`}
            onPress={() => {
              if (item.source === "youtube") void startRadioFor(item);
              else usePlayer.getState().playQueue(tracks, index);
            }}
            style={({ pressed }) => [styles.releaseCard, pressed && styles.pressed]}
          >
            <Artwork url={item.coverUrl} name={item.title} size={142} rounded="md" />
            <Text numberOfLines={1} style={styles.releaseTitle}>{item.title}</Text>
            <Text numberOfLines={1} style={styles.releaseArtist}>
              {item.artistName ?? "YouTube Music"}
            </Text>
          </Pressable>
        )}
      />
    </View>
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
  heroTitle: {
    color: colors.text,
    fontSize: font.xxl,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  heroDetails: { flex: 1, minWidth: 0 },
  heroTrack: { color: colors.text, fontSize: font.lg, fontWeight: "800" },
  heroArtist: { color: colors.muted, fontSize: font.sm, marginTop: spacing.xs },
  heroText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: font.sm,
    lineHeight: 20,
  },
  heroPlay: {
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    marginTop: spacing.lg,
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
  releaseCard: { width: 142 },
  releaseTitle: {
    color: colors.text,
    fontSize: font.sm,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  releaseArtist: { color: colors.muted, fontSize: font.xs, marginTop: 2 },
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
