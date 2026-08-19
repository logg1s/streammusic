import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import type { PlayableTrack } from "@vong/shared";
import { Artwork } from "@/components/artwork";
import {
  apiJson,
  pollTvPairing,
  signOut,
  startTvPairing,
  type TvPairingChallenge,
  useSession,
} from "@/lib/api";
import type {
  LibraryHome,
  SearchResult,
  TrackList,
  TracksPage,
} from "@/lib/dto";
import { startRadioFor } from "@/lib/radio-engine";
import { errorMessage, useApi } from "@/lib/use-api";
import { useCurrentTrack, usePlayer } from "@/store/player";
import { colors, onAccent, radius, spacing } from "@/theme";

type Section = "home" | "library" | "search" | "favorites" | "settings";

const NAV_ITEMS: { key: Section; label: string }[] = [
  { key: "home", label: "Trang chủ" },
  { key: "library", label: "Thư viện" },
  { key: "search", label: "Tìm kiếm" },
  { key: "favorites", label: "Yêu thích" },
  { key: "settings", label: "Cài đặt" },
];

export function TvRoot() {
  const { token, loading } = useSession();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  return token ? <TvShell /> : <TvPairing />;
}

function TvPairing() {
  const [challenge, setChallenge] = useState<TvPairingChallenge | null>(null);
  const [status, setStatus] = useState<
    "starting" | "waiting" | "expired" | "error"
  >("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const begin = async () => {
      setStatus("starting");
      setMessage(null);
      try {
        const next = await startTvPairing();
        if (!alive) return;
        setChallenge(next);
        setStatus("waiting");

        const poll = async () => {
          if (!alive) return;
          if (Date.now() >= next.expiresAt) {
            setStatus("expired");
            return;
          }
          try {
            const complete = await pollTvPairing(next.deviceCode);
            if (!complete && alive) timer = setTimeout(poll, next.intervalMs);
          } catch (cause) {
            if (!alive) return;
            setMessage(errorMessage(cause));
            timer = setTimeout(poll, Math.max(next.intervalMs, 5_000));
          }
        };
        timer = setTimeout(poll, next.intervalMs);
      } catch (cause) {
        if (!alive) return;
        setStatus("error");
        setMessage(errorMessage(cause));
      }
    };

    void begin();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [attempt]);

  return (
    <View style={styles.pairingScreen}>
      <Image
        source={require("../../assets/vong-wordmark.png")}
        style={{ width: 360, height: 100 }}
        contentFit="contain"
      />
      <View style={styles.pairingCard}>
        <Text style={styles.eyebrow}>ANDROID TV</Text>
        <Text style={styles.pairingTitle}>Ghép nối với tài khoản Vọng</Text>
        <Text style={styles.pairingBody}>
          Mở địa chỉ dưới đây trên điện thoại hoặc máy tính, đăng nhập rồi nhập
          mã đang hiện trên TV.
        </Text>

        {status === "starting" ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.mutedText}>Đang tạo mã an toàn…</Text>
          </View>
        ) : challenge ? (
          <>
            <Text style={styles.pairingUri}>
              {challenge.verificationUri.replace(/^https?:\/\//, "")}
            </Text>
            <Text
              accessibilityLabel={`Mã ghép nối ${challenge.displayCode}`}
              style={styles.pairingCode}
            >
              {challenge.displayCode}
            </Text>
            {status === "waiting" ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.mutedText}>Đang chờ xác nhận…</Text>
              </View>
            ) : null}
          </>
        ) : null}

        {message ? <Text style={styles.errorText}>{message}</Text> : null}
        {status === "expired" || status === "error" ? (
          <TvButton
            label="Tạo mã mới"
            preferredFocus
            onPress={() => setAttempt((value) => value + 1)}
          />
        ) : null}
      </View>
    </View>
  );
}

function TvShell() {
  const [section, setSection] = useState<Section>("home");

  return (
    <View style={styles.shell}>
      <View style={styles.sidebar}>
        <Image
          source={require("../../assets/vong-wordmark.png")}
          style={{ width: 184, height: 50, marginBottom: 54 }}
          contentFit="contain"
        />
        <View style={styles.navList}>
          {NAV_ITEMS.map((item, index) => (
            <TvButton
              key={item.key}
              label={item.label}
              selected={section === item.key}
              preferredFocus={index === 0}
              onPress={() => setSection(item.key)}
            />
          ))}
        </View>
      </View>

      <View style={styles.main}>
        <TvContent section={section} />
        <TvPlayerBar />
      </View>
    </View>
  );
}

function TvContent({ section }: { section: Section }) {
  if (section === "home") return <TvHome />;
  if (section === "library") return <TvLibrary />;
  if (section === "search") return <TvSearch />;
  if (section === "favorites") return <TvFavorites />;
  return <TvSettings />;
}

function TvHome() {
  const home = useApi<LibraryHome>("/api/library/home");
  const trending = useApi<TrackList>("/api/youtube/trending");

  return (
    <TvScroller title="Chào bạn">
      <TrackSection
        title="Nghe gần đây"
        tracks={home.data?.played ?? home.data?.recent ?? []}
        loading={home.loading}
        error={home.error}
        onRetry={home.reload}
      />
      <TrackSection
        title="Đang thịnh hành"
        tracks={trending.data?.tracks ?? []}
        loading={trending.loading}
        error={trending.error}
        onRetry={trending.reload}
      />
    </TvScroller>
  );
}

function TvLibrary() {
  const result = useApi<TracksPage>("/api/library/tracks?page=1");
  return (
    <TvScroller title="Thư viện">
      <TrackSection
        title="Tất cả bài hát"
        tracks={result.data?.tracks ?? []}
        loading={result.loading}
        error={result.error}
        onRetry={result.reload}
      />
    </TvScroller>
  );
}

function TvFavorites() {
  const result = useApi<TrackList>("/api/favorites");
  return (
    <TvScroller title="Yêu thích">
      <TrackSection
        title="Bài hát đã lưu"
        tracks={result.data?.tracks ?? []}
        loading={result.loading}
        error={result.error}
        onRetry={result.reload}
      />
    </TvScroller>
  );
}

interface YoutubeSearchState {
  query: string;
  tracks: PlayableTrack[];
  loading: boolean;
  error: string | null;
}

function TvSearch() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const library = useApi<SearchResult>(
    query ? `/api/library/search?q=${encodeURIComponent(query)}` : null,
  );
  const [youtube, setYoutube] = useState<YoutubeSearchState>({
    query: "",
    tracks: [],
    loading: false,
    error: null,
  });

  const runSearch = useCallback(() => {
    const next = text.trim();
    if (!next) return;
    setQuery(next);
    setYoutube({ query: next, tracks: [], loading: true, error: null });
    void apiJson<TrackList>("/api/youtube/search", {
      method: "POST",
      body: JSON.stringify({ q: next }),
    })
      .then((result) =>
        setYoutube({
          query: next,
          tracks: result.tracks,
          loading: false,
          error: null,
        }),
      )
      .catch((cause: unknown) =>
        setYoutube({
          query: next,
          tracks: [],
          loading: false,
          error: errorMessage(cause),
        }),
      );
  }, [text]);

  return (
    <TvScroller title="Tìm kiếm">
      <View style={styles.searchRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={runSearch}
          placeholder="Tên bài hát, nghệ sĩ hoặc album"
          placeholderTextColor={colors.subtle}
          style={styles.searchInput}
          returnKeyType="search"
        />
        <TvButton label="Tìm" onPress={runSearch} />
      </View>
      {query ? (
        <>
          <TrackSection
            title="Trong thư viện"
            tracks={library.data?.tracks ?? []}
            loading={library.loading}
            error={library.error}
            onRetry={library.reload}
          />
          <TrackSection
            title="Trên YouTube"
            tracks={youtube.query === query ? youtube.tracks : []}
            loading={youtube.query === query && youtube.loading}
            error={youtube.query === query ? youtube.error : null}
          />
        </>
      ) : (
        <Text style={styles.emptyText}>
          Chọn ô tìm kiếm để mở bàn phím TV, rồi bấm Tìm.
        </Text>
      )}
    </TvScroller>
  );
}

function TvSettings() {
  return (
    <TvScroller title="Cài đặt">
      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Kho nhạc và YouTube</Text>
        <Text style={styles.mutedText}>
          Quản lý kết nối trên streammusic.vercel.app. TV sẽ dùng lại thư viện
          của tài khoản này.
        </Text>
      </View>
      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Tài khoản</Text>
        <TvButton label="Đăng xuất khỏi TV" onPress={() => void signOut()} />
      </View>
    </TvScroller>
  );
}

function TvScroller({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <ScrollView
      style={styles.scroller}
      contentContainerStyle={styles.scrollerContent}
    >
      <Text style={styles.pageTitle}>{title}</Text>
      {children}
      <View style={styles.scrollFooter} />
    </ScrollView>
  );
}

function TrackSection({
  title,
  tracks,
  loading,
  error,
  onRetry,
}: {
  title: string;
  tracks: PlayableTrack[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  if (loading && tracks.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.mutedText}>Đang tải…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          {onRetry ? <TvButton label="Thử lại" onPress={onRetry} /> : null}
        </View>
      ) : null}
      {tracks.length === 0 && !error ? (
        <Text style={styles.emptyText}>Chưa có bài hát nào.</Text>
      ) : (
        <View style={styles.trackGrid}>
          {tracks.slice(0, 24).map((track, index) => (
            <TvTrackCard
              key={track.id}
              track={track}
              tracks={tracks}
              index={index}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function TvTrackCard({
  track,
  tracks,
  index,
}: {
  track: PlayableTrack;
  tracks: PlayableTrack[];
  index: number;
}) {
  const [focused, setFocused] = useState(false);
  const current = useCurrentTrack();
  const active = current?.id === track.id;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Phát ${track.title}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => {
        if (track.source === "youtube") void startRadioFor(track);
        else usePlayer.getState().playQueue(tracks, index);
      }}
      style={[
        styles.trackCard,
        focused && styles.focused,
        active && styles.activeCard,
      ]}
    >
      <Artwork url={track.coverUrl} name={track.title} size={96} rounded="lg" />
      <View style={styles.trackCopy}>
        <Text numberOfLines={1} style={styles.trackTitle}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.trackArtist}>
          {track.artistName ??
            (track.source === "youtube" ? "YouTube" : "Không rõ nghệ sĩ")}
        </Text>
      </View>
      {active ? <Text style={styles.nowPlaying}>ĐANG PHÁT</Text> : null}
    </Pressable>
  );
}

function TvPlayerBar() {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((state) => state.isPlaying);
  const currentTime = usePlayer((state) => state.currentTime);

  if (!track) return null;
  return (
    <View style={styles.playerBar}>
      <Artwork url={track.coverUrl} name={track.title} size={64} rounded="md" />
      <View style={styles.playerCopy}>
        <Text numberOfLines={1} style={styles.playerTitle}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.trackArtist}>
          {track.artistName ?? "Không rõ nghệ sĩ"}
        </Text>
      </View>
      <View style={styles.playerControls}>
        <TvButton
          label="−10 giây"
          onPress={() => usePlayer.getState().seek(currentTime - 10)}
        />
        <TvButton
          label="Bài trước"
          onPress={() => usePlayer.getState().previous()}
        />
        <TvButton
          label={isPlaying ? "Tạm dừng" : "Phát"}
          selected
          onPress={() => usePlayer.getState().toggle()}
        />
        <TvButton label="Bài sau" onPress={() => usePlayer.getState().next()} />
        <TvButton
          label="+10 giây"
          onPress={() => usePlayer.getState().seek(currentTime + 10)}
        />
      </View>
    </View>
  );
}

function TvButton({
  label,
  onPress,
  selected = false,
  preferredFocus = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  preferredFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={preferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.button,
        selected && styles.buttonSelected,
        focused && styles.focused,
      ]}
    >
      <Text style={[styles.buttonText, selected && styles.buttonTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  pairingScreen: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 96,
    padding: 72,
    backgroundColor: colors.bg,
  },
  pairingCard: {
    width: 680,
    padding: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
  eyebrow: {
    color: colors.accentText,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 3,
  },
  pairingTitle: {
    marginTop: 16,
    color: colors.text,
    fontSize: 42,
    fontWeight: "700",
  },
  pairingBody: {
    marginTop: 18,
    color: colors.muted,
    fontSize: 22,
    lineHeight: 32,
  },
  pairingUri: {
    marginTop: 36,
    color: colors.text,
    fontSize: 25,
    fontWeight: "600",
  },
  pairingCode: {
    marginTop: 16,
    color: colors.accentText,
    fontSize: 58,
    fontWeight: "800",
    letterSpacing: 5,
  },
  shell: { flex: 1, flexDirection: "row", backgroundColor: colors.bg },
  sidebar: {
    width: 290,
    paddingHorizontal: 28,
    paddingVertical: 36,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },
  navList: { gap: 14 },
  main: { flex: 1 },
  scroller: { flex: 1 },
  scrollerContent: { paddingHorizontal: 52, paddingTop: 38 },
  pageTitle: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "700",
    marginBottom: 32,
  },
  section: { marginBottom: 44 },
  sectionTitle: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "700",
    marginBottom: 18,
  },
  trackGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  trackCard: {
    width: 420,
    minHeight: 120,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  focused: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
    transform: [{ scale: 1.04 }],
  },
  activeCard: { backgroundColor: colors.accentSoft },
  trackCopy: { flex: 1 },
  trackTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
  trackArtist: { marginTop: 5, color: colors.muted, fontSize: 16 },
  nowPlaying: { color: colors.accentText, fontSize: 11, fontWeight: "800" },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 24,
  },
  mutedText: { color: colors.muted, fontSize: 18, lineHeight: 27 },
  emptyText: { color: colors.subtle, fontSize: 18 },
  errorText: { color: colors.danger, fontSize: 18, lineHeight: 26 },
  errorRow: { alignItems: "flex-start", gap: 14, marginBottom: 16 },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  buttonSelected: { backgroundColor: colors.accent },
  buttonText: { color: colors.text, fontSize: 18, fontWeight: "600" },
  buttonTextSelected: { color: onAccent },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginBottom: 40,
  },
  searchInput: {
    width: 720,
    height: 64,
    paddingHorizontal: 22,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 22,
  },
  settingsCard: {
    maxWidth: 850,
    marginBottom: 28,
    padding: 28,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "flex-start",
  },
  playerBar: {
    height: 94,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 26,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  playerCopy: { width: 280 },
  playerTitle: { color: colors.text, fontSize: 19, fontWeight: "700" },
  playerControls: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  scrollFooter: { height: 44 },
});
