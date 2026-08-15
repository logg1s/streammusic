import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { PlayableTrack } from "@vong/shared";
import { ALBUM_CARD_WIDTH, AlbumCard } from "@/components/album-card";
import {
  EmptyNote,
  ErrorNote,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import { TrackRow } from "@/components/track-row";
import { apiJson } from "@/lib/api";
import type { SearchResult, TrackList } from "@/lib/dto";
import { errorMessage, useApi } from "@/lib/use-api";
import { colors, font, radius, spacing } from "@/theme";

/** Chờ người ta gõ xong mới gọi — mỗi ký tự một request thì YouTube chặn ngay. */
const DEBOUNCE_MS = 350;

interface YoutubeState {
  tracks: PlayableTrack[];
  loading: boolean;
  error: string | null;
}

/** Kết quả của một lượt tìm đã xong, kèm từ khoá đã sinh ra nó. */
interface YoutubeAttempt {
  query: string;
  tracks: PlayableTrack[];
  error: string | null;
}

const IDLE: YoutubeState = { tracks: [], loading: false, error: null };

export default function SearchScreen() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const content = useContentInsets();

  useEffect(() => {
    const trimmed = text.trim();
    const timer = setTimeout(() => setQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const library = useApi<SearchResult>(
    query.length > 0 ? `/api/library/search?q=${encodeURIComponent(query)}` : null,
  );

  /**
   * Nhánh YouTube gọi tay vì đây là `POST` — `useApi` chỉ lo `GET`. Trạng thái riêng
   * để YouTube hỏng (hết quota, InnerTube đổi) không xoá mất kết quả thư viện.
   *
   * Chỉ giữ kết quả của lượt gọi đã xong kèm từ khoá của nó; "đang tải" được suy ra khi
   * từ khoá hiện tại chưa có kết quả. Set trạng thái ngay trong thân effect thì mỗi lần
   * gõ thêm một chữ là một lượt render vô ích.
   */
  const [done, setDone] = useState<YoutubeAttempt | null>(null);

  useEffect(() => {
    if (query.length === 0) return;

    let alive = true;

    apiJson<TrackList>("/api/youtube/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: query }),
    })
      .then((result) => {
        if (alive) setDone({ query, tracks: result.tracks, error: null });
      })
      .catch((cause: unknown) => {
        if (alive) setDone({ query, tracks: [], error: errorMessage(cause) });
      });

    return () => {
      alive = false;
    };
  }, [query]);

  const youtube: YoutubeState =
    query.length === 0
      ? IDLE
      : done !== null && done.query === query
        ? { tracks: done.tracks, loading: false, error: done.error }
        : { tracks: [], loading: true, error: null };

  const libraryTracks = library.data?.tracks ?? [];
  const libraryAlbums = library.data?.albums ?? [];
  const nothingFound =
    query.length > 0 &&
    !library.loading &&
    !youtube.loading &&
    libraryTracks.length === 0 &&
    libraryAlbums.length === 0 &&
    youtube.tracks.length === 0;

  return (
    <Screen>
      <View style={styles.searchBar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Tên bài, nghệ sĩ hay album"
          placeholderTextColor={colors.subtle}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={colors.accent}
        />
      </View>

      <ScrollView
        contentContainerStyle={content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {query.length === 0 ? (
          <EmptyNote
            title="Tìm nhạc"
            hint="Gõ vào ô trên để tìm trong thư viện của bạn, và tìm luôn trên YouTube."
          />
        ) : null}

        {library.error !== null ? (
          <ErrorNote message={library.error} onRetry={library.reload} />
        ) : null}

        {libraryTracks.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label="Trong thư viện" />
            {libraryTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                tracks={libraryTracks}
                index={index}
              />
            ))}
          </View>
        ) : null}

        {libraryAlbums.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label="Album" />
            <FlatList
              data={libraryAlbums}
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

        {query.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label="Trên YouTube" />
            {youtube.loading ? (
              <View style={styles.inline}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.inlineText}>Đang tìm trên YouTube…</Text>
              </View>
            ) : null}
            {youtube.error !== null ? (
              <Text style={styles.inlineText}>{youtube.error}</Text>
            ) : null}
            {youtube.tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                tracks={youtube.tracks}
                index={index}
              />
            ))}
          </View>
        ) : null}

        {nothingFound ? (
          <EmptyNote
            title="Không có kết quả"
            hint={`Không tìm thấy gì cho “${query}”. Thử bớt chữ hoặc đổi từ khoá.`}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    color: colors.text,
    fontSize: font.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  gap: {
    width: spacing.md,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  inlineText: {
    color: colors.subtle,
    fontSize: font.sm,
  },
});
