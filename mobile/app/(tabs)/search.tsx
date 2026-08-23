import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  findNewReleaseSection,
  type DiscoveryHomeSection,
  type PlayableTrack,
} from "@vong/shared";
import { ALBUM_CARD_WIDTH, AlbumCard } from "@/components/album-card";
import { Artwork } from "@/components/artwork";
import {
  EmptyNote,
  ErrorNote,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import { TrackRow } from "@/components/track-row";
import { getAnalytics } from "@/lib/analytics";
import { apiJson } from "@/lib/api";
import type { SearchResult, TrackList, YoutubeSections } from "@/lib/dto";
import { errorMessage, useApi } from "@/lib/use-api";
import { startRadioFor } from "@/lib/radio-engine";
import { colors, font, radius, spacing } from "@/theme";

/** Chờ người ta gõ xong mới gọi — mỗi ký tự một request thì YouTube chặn ngay. */
const DEBOUNCE_MS = 350;
const SUGGEST_DEBOUNCE_MS = 180;
const SEARCH_HISTORY_KEY = "vong-search-history";
const SEARCH_HISTORY_LIMIT = 3;

interface SuggestionList {
  suggestions: string[];
}

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
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const content = useContentInsets();

  useEffect(() => {
    void AsyncStorage.getItem(SEARCH_HISTORY_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHistory(
            parsed
              .filter((item): item is string => typeof item === "string")
              .slice(0, SEARCH_HISTORY_LIMIT),
          );
        }
      } catch {
        // Bản ghi cũ hỏng không được làm màn tìm kiếm hỏng theo.
      }
    });
  }, []);

  useEffect(() => {
    const trimmed = text.trim();
    const timer = setTimeout(() => setQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(() => {
      setHistory((current) => {
        const next = [query, ...current.filter((item) => item !== query)].slice(
          0,
          SEARCH_HISTORY_LIMIT,
        );
        void AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const input = text.trim();
    if (input.length < 2) {
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void apiJson<SuggestionList>(
        `/api/youtube/suggestions?q=${encodeURIComponent(input)}`,
      )
        .then((result) => {
          if (alive) setSuggestions(result.suggestions);
        })
        .catch(() => {
          if (alive) setSuggestions([]);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text]);

  const library = useApi<SearchResult>(
    query.length > 0 ? `/api/library/search?q=${encodeURIComponent(query)}` : null,
  );
  // Search không có từ khoá cũng phải là một bề mặt nghe nhạc. Hai endpoint này
  // chỉ trả metadata; bấm bài vẫn đi qua radio engine hiện có ở dưới.
  const discovery = useApi<YoutubeSections>(
    query.length === 0 ? "/api/youtube/home" : null,
  );
  const trending = useApi<TrackList>(
    query.length === 0 ? "/api/youtube/trending" : null,
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
        if (!alive) return;
        setDone({ query, tracks: result.tracks, error: null });
        // Chỉ đếm, KHÔNG kèm từ khoá — xem `ANALYTICS_EVENTS` trong `@vong/shared`.
        getAnalytics().track("search_run", {
          results: result.tracks.length,
          hasYoutube: result.tracks.length > 0,
        });
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
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={colors.subtle} />
          <TextInput
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (next.trim().length < 2) setSuggestions([]);
            }}
            placeholder="Tên bài, nghệ sĩ hoặc album"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={colors.accent}
          />
          {text.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xoá từ khoá"
              onPress={() => setText("")}
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.subtle}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {(suggestions.length > 0 || (text.length === 0 && history.length > 0)) ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.suggestionStrip}
        >
          {(suggestions.length > 0 ? suggestions : history).map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`Tìm ${choice}`}
              onPress={() => {
                setText(choice);
                setQuery(choice);
                setSuggestions([]);
              }}
              style={({ pressed }) => [
                styles.suggestion,
                pressed && styles.suggestionPressed,
              ]}
            >
              <Ionicons
                name={suggestions.length > 0 ? "search" : "time-outline"}
                size={14}
                color={colors.subtle}
              />
              <Text numberOfLines={1} style={styles.suggestionText}>
                {choice}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {query.length === 0 ? (
          <SearchLanding
            sections={discovery.data?.sections ?? []}
            trending={trending.data?.tracks ?? []}
            loading={discovery.loading || trending.loading}
            failed={discovery.error !== null && trending.error !== null}
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
                radioOnTap
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
                radioOnTap
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

function SearchLanding({
  sections,
  trending,
  loading,
  failed,
}: {
  sections: DiscoveryHomeSection[];
  trending: PlayableTrack[];
  loading: boolean;
  failed: boolean;
}) {
  const release = findNewReleaseSection(sections);
  const remaining = sections.filter((section) => section !== release).slice(0, 2);
  const hasContent = Boolean(release) || remaining.length > 0 || trending.length > 0;

  if (loading && !hasContent) {
    return (
      <View style={styles.discoveryLoading} accessibilityLabel="Đang tải nhạc khám phá">
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.inlineText}>Đang lấy nhạc để khám phá…</Text>
      </View>
    );
  }

  if (!hasContent) {
    return (
      <EmptyNote
        title={failed ? "Chưa tải được nhạc khám phá" : "Tìm nhạc"}
        hint={
          failed
            ? "Bạn vẫn có thể tìm trong thư viện và trên YouTube bằng ô phía trên."
            : "Gõ vào ô trên để tìm trong thư viện của bạn, và tìm luôn trên YouTube."
        }
      />
    );
  }

  return (
    <View style={styles.discovery}>
      <Text style={styles.discoveryEyebrow}>KHÁM PHÁ</Text>
      <Text style={styles.discoveryTitle}>Có thể bạn sẽ thích</Text>
      {release ? <DiscoveryRail label="Mới phát hành" tracks={release.tracks} /> : null}
      {trending.length > 0 ? <DiscoveryRail label="Đang thịnh hành" tracks={trending} /> : null}
      {remaining.map((section) => (
        <DiscoveryRail key={section.title} label={section.title} tracks={section.tracks} />
      ))}
    </View>
  );
}

function DiscoveryRail({ label, tracks }: { label: string; tracks: PlayableTrack[] }) {
  if (tracks.length === 0) return null;

  return (
    <View style={styles.discoveryRail}>
      <SectionHeader label={label} />
      <FlatList
        data={tracks.slice(0, 12)}
        keyExtractor={(track) => track.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Phát ${item.title}`}
            onPress={() => {
              if (item.source === "youtube") void startRadioFor(item);
            }}
            style={({ pressed }) => [styles.discoveryCard, pressed && styles.suggestionPressed]}
          >
            <Artwork url={item.coverUrl} name={item.title} size={142} rounded="md" />
            <Text numberOfLines={1} style={styles.discoveryCardTitle}>{item.title}</Text>
            <Text numberOfLines={1} style={styles.discoveryCardArtist}>
              {item.artistName ?? "YouTube Music"}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: font.md,
    paddingVertical: spacing.md,
  },
  suggestionStrip: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  suggestion: {
    maxWidth: 240,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  suggestionPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  suggestionText: {
    color: colors.text,
    fontSize: font.sm,
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
  discovery: {
    marginTop: spacing.xxl,
  },
  discoveryEyebrow: {
    color: colors.subtle,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  discoveryTitle: {
    color: colors.text,
    fontSize: font.xxl,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  discoveryRail: {
    marginBottom: spacing.xxl,
  },
  discoveryCard: {
    width: 142,
  },
  discoveryCardTitle: {
    color: colors.text,
    fontSize: font.sm,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  discoveryCardArtist: {
    color: colors.subtle,
    fontSize: font.xs,
    marginTop: 2,
  },
  discoveryLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
});
