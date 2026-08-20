import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
        style={{ width: 190, height: 54 }}
        contentFit="contain"
      />
      <View style={styles.pairingCard}>
        <Text style={styles.eyebrow}>ANDROID TV</Text>
        <Text style={styles.pairingTitle}>Ghép nối với tài khoản Vọng</Text>
        <Text style={styles.pairingBody}>
          Quét QR bằng điện thoại để mở mã tự động, hoặc vào địa chỉ bên dưới và
          nhập mã thủ công. Sau đó đăng nhập và xác nhận TV này.
        </Text>

        {status === "starting" ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.mutedText}>Đang tạo mã an toàn…</Text>
          </View>
        ) : challenge ? (
          <View style={styles.pairingOptions}>
            <View style={styles.qrFrame}>
              <Image
                source={{ uri: challenge.qrImageUri }}
                accessibilityLabel={`QR ghép nối mã ${challenge.displayCode}`}
                style={styles.qrImage}
                contentFit="contain"
              />
            </View>
            <View style={styles.pairingDetails}>
              <Text style={styles.pairingHint}>HOẶC NHẬP MÃ TRÊN ĐIỆN THOẠI</Text>
              <Text
                accessibilityLabel={`Mã ghép nối ${challenge.displayCode}`}
                style={styles.pairingCode}
              >
                {challenge.displayCode}
              </Text>
              <Text style={styles.pairingUri}>
                {challenge.verificationUri.replace(/^https?:\/\//, "")}
              </Text>
              {status === "waiting" ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.mutedText}>Đang chờ điện thoại xác nhận…</Text>
                </View>
              ) : null}
              {status === "expired" ? (
                <Text style={styles.errorText}>Mã đã hết hạn.</Text>
              ) : null}
            </View>
          </View>
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
  const [playerOpen, setPlayerOpen] = useState(false);
  const currentTrack = useCurrentTrack();

  return (
    <View style={styles.shell}>
      <View style={styles.sidebar}>
        <Image
          source={require("../../assets/vong-wordmark.png")}
          style={{ width: 96, height: 32, marginBottom: 28 }}
          contentFit="contain"
        />
        <View style={styles.navList}>
          {NAV_ITEMS.map((item, index) => (
            <TvButton
              key={item.key}
              label={item.label}
              selected={!playerOpen && section === item.key}
              preferredFocus={index === 0}
              onPress={() => {
                setSection(item.key);
                setPlayerOpen(false);
              }}
            />
          ))}
          {currentTrack ? (
            <TvButton
              label="Đang phát"
              selected={playerOpen}
              onPress={() => setPlayerOpen(true)}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.main}>
        {playerOpen ? (
          <TvNowPlaying onClose={() => setPlayerOpen(false)} />
        ) : (
          <>
            <TvContent section={section} />
            <TvPlayerBar onOpen={() => setPlayerOpen(true)} />
          </>
        )}
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
      <Artwork url={track.coverUrl} name={track.title} size={72} rounded="lg" />
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

function tvTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function TvNowPlaying({ onClose }: { onClose: () => void }) {
  const track = useCurrentTrack();
  const queue = usePlayer((state) => state.queue);
  const order = usePlayer((state) => state.order);
  const position = usePlayer((state) => state.position);
  const currentTime = usePlayer((state) => state.currentTime);
  const duration = usePlayer((state) => state.duration);
  const isPlaying = usePlayer((state) => state.isPlaying);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  if (!track) return <TvScroller title="Đang phát"><Text style={styles.emptyText}>Chưa chọn bài nào.</Text></TvScroller>;

  const upcoming = order
    .map((queueIndex, orderPosition) => ({
      orderPosition,
      track: queue[queueIndex],
    }))
    .filter(
      (item): item is { orderPosition: number; track: PlayableTrack } =>
        Boolean(item.track) && item.orderPosition > position,
    );
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <View style={styles.tvPlayerScreen}>
      <View style={styles.tvPlayerMain}>
        <View style={styles.tvPlayerHeadingRow}>
          <Text style={styles.tvPlayerHeading}>Đang phát</Text>
          <TvButton label="Đóng" onPress={onClose} />
        </View>
        <View style={styles.tvHeroRow}>
          <Artwork url={track.coverUrl} name={track.title} size={218} rounded="lg" />
          <View style={styles.tvHeroMeta}>
            <Text numberOfLines={3} style={styles.tvHeroTitle}>{track.title}</Text>
            <Text numberOfLines={1} style={styles.tvHeroArtist}>
              {track.artistName ?? "Không rõ nghệ sĩ"}
            </Text>
            <Text style={styles.tvTime}>{tvTime(currentTime)} / {tvTime(duration)}</Text>
            <View style={styles.tvProgressTrack}>
              <View style={[styles.tvProgressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>
        <View style={styles.tvTransport}>
          <TvIconButton label="Bài trước" icon="play-skip-back" onPress={() => usePlayer.getState().previous()} />
          <TvIconButton label="Lùi 10 giây" icon="play-back" onPress={() => usePlayer.getState().seek(currentTime - 10)} />
          <TvIconButton
            label={isPlaying ? "Tạm dừng" : "Phát"}
            icon={isPlaying ? "pause" : "play"}
            selected
            onPress={() => usePlayer.getState().toggle()}
          />
          <TvIconButton label="Tiến 10 giây" icon="play-forward" onPress={() => usePlayer.getState().seek(currentTime + 10)} />
          <TvIconButton label="Bài sau" icon="play-skip-forward" onPress={() => usePlayer.getState().next()} />
        </View>
      </View>

      <View style={styles.tvQueuePane}>
        <Text style={styles.tvQueueHeading}>Hàng đợi</Text>
        <Text style={styles.tvQueueSection}>Tiếp theo</Text>
        <ScrollView contentContainerStyle={styles.tvQueueList}>
          {upcoming.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có bài nào phía sau.</Text>
          ) : (
            upcoming.map((item, index) => (
              <TvQueueRow
                key={`${item.orderPosition}:${item.track.id}`}
                item={item}
                preferredFocus={index === 0}
              />
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function TvQueueRow({
  item,
  preferredFocus,
}: {
  item: { orderPosition: number; track: PlayableTrack };
  preferredFocus: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Phát ${item.track.title}`}
      hasTVPreferredFocus={preferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => usePlayer.getState().playTrackAt(item.orderPosition)}
      style={[styles.tvQueueRow, focused && styles.tvQueueRowFocused]}
    >
      <Artwork url={item.track.coverUrl} name={item.track.title} size={54} rounded="md" />
      <Text style={styles.tvQueueNumber}>{item.orderPosition + 1}</Text>
      <View style={styles.tvQueueCopy}>
        <Text numberOfLines={1} style={styles.tvQueueTitle}>{item.track.title}</Text>
        <Text numberOfLines={1} style={styles.tvQueueArtist}>
          {item.track.artistName ?? "Không rõ nghệ sĩ"}
        </Text>
      </View>
      <Ionicons name="ellipsis-vertical" size={22} color={colors.muted} />
    </Pressable>
  );
}

function TvIconButton({
  label,
  icon,
  onPress,
  selected = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  selected?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.tvIconButton,
        selected && styles.tvIconButtonSelected,
        focused && styles.tvIconButtonFocused,
      ]}
    >
      <Ionicons name={icon} size={28} color={selected ? onAccent : colors.text} />
    </Pressable>
  );
}

function TvPlayerBar({ onOpen }: { onOpen: () => void }) {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((state) => state.isPlaying);
  const currentTime = usePlayer((state) => state.currentTime);

  if (!track) return null;
  return (
    <View style={styles.playerBar}>
      <Artwork url={track.coverUrl} name={track.title} size={48} rounded="md" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mở trình phát và hàng đợi: ${track.title}`}
        onPress={onOpen}
        style={styles.playerCopy}
      >
        <Text numberOfLines={1} style={styles.playerTitle}>{track.title}</Text>
        <Text numberOfLines={1} style={styles.trackArtist}>
          {track.artistName ?? "Không rõ nghệ sĩ"}
        </Text>
      </Pressable>
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
        <TvButton label="Hàng đợi" onPress={onOpen} />
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
    gap: 48,
    padding: 48,
    backgroundColor: colors.bg,
  },
  pairingCard: {
    width: 720,
    padding: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  eyebrow: {
    color: colors.accentText,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2.4,
  },
  pairingTitle: {
    marginTop: 10,
    color: colors.text,
    fontSize: 29,
    fontWeight: "800",
  },
  pairingBody: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 18,
    lineHeight: 26,
  },
  pairingUri: {
    marginTop: 14,
    color: colors.muted,
    fontSize: 18,
    fontWeight: "600",
  },
  pairingOptions: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 28,
  },
  qrFrame: {
    width: 210,
    height: 210,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: "#ffffff",
  },
  qrImage: { width: 190, height: 190 },
  pairingDetails: { flex: 1 },
  pairingHint: {
    color: colors.subtle,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  pairingCode: {
    marginTop: 8,
    color: colors.accentText,
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: 5,
  },
  shell: { flex: 1, flexDirection: "row", backgroundColor: colors.bg },
  sidebar: {
    width: 136,
    paddingHorizontal: 14,
    paddingVertical: 24,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },
  navList: { gap: 8 },
  main: { flex: 1 },
  scroller: { flex: 1 },
  scrollerContent: { paddingHorizontal: 34, paddingTop: 28 },
  pageTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 24,
  },
  section: { marginBottom: 32 },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 18,
  },
  trackGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  trackCard: {
    width: 316,
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  focused: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
    transform: [{ scale: 1.035 }],
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
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  buttonSelected: { backgroundColor: colors.accentSoft },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  buttonTextSelected: { color: colors.accentText },
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
  tvPlayerScreen: {
    flex: 1,
    flexDirection: "row",
    gap: 20,
    padding: 26,
    backgroundColor: colors.bg,
  },
  tvPlayerMain: { flex: 1, minWidth: 0 },
  tvPlayerHeadingRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  tvPlayerHeading: { color: colors.text, fontSize: 30, fontWeight: "800" },
  tvHeroRow: { flexDirection: "row", alignItems: "center", gap: 24 },
  tvHeroMeta: { flex: 1, minWidth: 0 },
  tvHeroTitle: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
  },
  tvHeroArtist: { marginTop: 14, color: colors.muted, fontSize: 20 },
  tvTime: {
    marginTop: 28,
    color: colors.muted,
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },
  tvProgressTrack: {
    height: 5,
    marginTop: 10,
    overflow: "hidden",
    borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
  },
  tvProgressFill: { height: "100%", borderRadius: radius.full, backgroundColor: colors.accent },
  tvTransport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 26,
  },
  tvIconButton: {
    width: 66,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  tvIconButtonSelected: { backgroundColor: colors.accent },
  tvIconButtonFocused: {
    borderColor: colors.accentText,
    transform: [{ scale: 1.06 }],
  },
  tvQueuePane: {
    width: 310,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  tvQueueHeading: { color: colors.text, fontSize: 28, fontWeight: "800" },
  tvQueueSection: { marginTop: 22, marginBottom: 10, color: colors.muted, fontSize: 18, fontWeight: "700" },
  tvQueueList: { gap: 8, paddingBottom: 20 },
  tvQueueRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radius.md,
  },
  tvQueueRowFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
    transform: [{ scale: 1.025 }],
  },
  tvQueueNumber: { width: 18, color: colors.subtle, fontSize: 17, fontWeight: "700", textAlign: "center" },
  tvQueueCopy: { flex: 1, minWidth: 0 },
  tvQueueTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  tvQueueArtist: { marginTop: 4, color: colors.muted, fontSize: 14 },
  playerBar: {
    height: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  playerCopy: { width: 240, minHeight: 52, justifyContent: "center" },
  playerTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  playerControls: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  scrollFooter: { height: 44 },
});
