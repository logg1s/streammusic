import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { getAnalytics } from "@/lib/analytics";
import { ErrorNote, Loading, Screen } from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import {
  CONNECTION_STATUS_LABEL,
  PROVIDER_LABEL,
  formatNumber,
} from "@/lib/format";
import { apiFetch, apiJson, signOut } from "@/lib/api";
import type { ConnectionsSummary, YoutubeSyncResult } from "@/lib/dto";
import { openOAuthFlow } from "@/lib/oauth";
import { errorMessage, useApi } from "@/lib/use-api";
import { usePlayer } from "@/store/player";
import { colors, font, onAccent, radius, spacing } from "@/theme";

/**
 * Cài đặt: kho lưu trữ đã nối, tài khoản YouTube, hai công tắc, và đăng xuất.
 *
 * Việc nặng của kho lưu trữ (chọn thư mục, quét) ở màn `settings/connections`; ở đây
 * chỉ giữ phần đọc nhanh và lối rẽ sang đó.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<ConnectionsSummary>(
    "/api/connections",
  );
  const autoplay = usePlayer((s) => s.autoplay);
  const setAutoplay = usePlayer((s) => s.setAutoplay);

  const [ytBusy, setYtBusy] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  /** Kết quả lượt đồng bộ vừa chạy — số của `/api/connections` chỉ mới sau khi reload. */
  const [ytSynced, setYtSynced] = useState<YoutubeSyncResult | null>(null);

  // `null` cho tới khi đọc xong AsyncStorage — hiện sẵn "bật" rồi lật sang "tắt" ngay
  // trước mắt người đã tắt nó là kiểu nhấp nháy khiến người dùng mất tin.
  const [telemetry, setTelemetry] = useState<boolean | null>(null);

  useEffect(() => {
    const analytics = getAnalytics();
    void analytics.init().then(() => setTelemetry(analytics.isEnabled()));
  }, []);

  const toggleTelemetry = (value: boolean) => {
    setTelemetry(value);
    const analytics = getAnalytics();
    void analytics.setEnabled(value);
    // Chỉ ghi nhận lúc bật lại; gửi một sự kiện ngay sau khi người dùng vừa tắt thu
    // thập là làm đúng thứ họ vừa từ chối.
    if (value) analytics.track("setting_change", { key: "telemetry", value: "on" });
  };

  const syncYoutube = async () => {
    setYtBusy(true);
    setYtError(null);
    try {
      const result = await apiJson<YoutubeSyncResult>("/api/youtube/sync", {
        method: "POST",
      });
      setYtSynced(result);
      reload();
    } catch (cause) {
      setYtError(errorMessage(cause));
    } finally {
      setYtBusy(false);
    }
  };

  const unlinkYoutube = () => {
    Alert.alert(
      "Bỏ liên kết YouTube?",
      "Gu nhạc đã đồng bộ sẽ bị xoá. Radio vẫn chạy, chỉ là chưa cá nhân hoá.",
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Bỏ liên kết",
          style: "destructive",
          onPress: () => {
            setYtBusy(true);
            setYtError(null);
            // `apiFetch` chứ không `apiJson`: route trả 204 không thân, đọc JSON là ném.
            void apiFetch("/api/youtube/link", { method: "DELETE" })
              .then(() => {
                setYtSynced(null);
                reload();
              })
              .catch((cause: unknown) => setYtError(errorMessage(cause)))
              .finally(() => setYtBusy(false));
          },
        },
      ],
    );
  };

  const linkYoutube = () => {
    setYtError(null);
    void openOAuthFlow("/api/youtube/oauth/authorize").then(reload);
  };

  return (
    <Screen scroll refreshing={loading} onRefresh={reload}>
      <View style={styles.section}>
        <SectionHeader label="Phát nhạc" />
        <View style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Tự phát tiếp</Text>
            <Text style={styles.rowMeta}>
              Hết album/playlist thì tự phát bài đề xuất theo gu.
            </Text>
          </View>
          <Switch
            value={autoplay}
            onValueChange={setAutoplay}
            trackColor={{ true: colors.accent, false: colors.surfaceElevated }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader label="Riêng tư" />
        <View style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Gửi số liệu ẩn danh</Text>
            <Text style={styles.rowMeta}>
              Giúp biết tính năng nào thật sự được dùng. Không gửi từ khoá tìm
              kiếm, không gửi tên bài hát, không gắn với tài khoản của bạn.
            </Text>
          </View>
          <Switch
            value={telemetry ?? false}
            disabled={telemetry === null}
            onValueChange={toggleTelemetry}
            trackColor={{ true: colors.accent, false: colors.surfaceElevated }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      {loading && data === null ? <Loading /> : null}
      {error !== null && data === null ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : null}

      {data !== null ? (
        <>
          <View style={styles.section}>
            <SectionHeader
              label="Kho lưu trữ"
              actionLabel="Quản lý"
              onAction={() => router.push("/settings/connections")}
            />
            {data.connections.length === 0 ? (
              <Text style={styles.note}>
                Chưa nối kho nào. Bấm Quản lý để nối
                {data.available.length > 0
                  ? ` ${data.available.map((p) => p.displayName).join(", ")}`
                  : " một kho lưu trữ"}
                , rồi quét thư mục nhạc.
              </Text>
            ) : (
              data.connections.map((connection) => (
                <View key={connection.id} style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      {PROVIDER_LABEL[connection.provider]}
                    </Text>
                    <Text numberOfLines={1} style={styles.rowMeta}>
                      {connection.label}
                    </Text>
                  </View>
                  <View style={styles.rowEnd}>
                    <Text style={styles.rowMeta}>
                      {formatNumber(connection.trackCount)} bài
                    </Text>
                    <Text
                      style={[
                        styles.rowMeta,
                        connection.status !== "active" && styles.warn,
                      ]}
                    >
                      {CONNECTION_STATUS_LABEL[connection.status] ??
                        connection.status}
                      {connection.roots.length > 0
                        ? `  ·  ${connection.roots.length} thư mục`
                        : ""}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <SectionHeader label="YouTube" />
            {!data.youtube.configured ? (
              <Text style={styles.note}>
                Máy chủ chưa cấu hình OAuth YouTube, nên chỉ tìm và phát được bài
                công khai.
              </Text>
            ) : data.youtube.connected ? (
              <>
                <Text style={styles.rowTitle}>
                  {data.youtube.channelTitle ?? "Đã nối tài khoản"}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatNumber(data.youtube.likedCount)} bài đã thích ·{" "}
                  {formatNumber(data.youtube.artistCount)} nghệ sĩ theo dõi
                </Text>
                {data.youtube.needsReauth ? (
                  <Text style={[styles.rowMeta, styles.warn]}>
                    Liên kết đã hết quyền truy cập. Google thu hồi refresh token
                    sau 7 ngày khi app còn ở chế độ Testing — đây là hành vi bình
                    thường, không phải lỗi.
                  </Text>
                ) : null}
                {ytSynced !== null ? (
                  <Text style={styles.rowMeta}>
                    Vừa đồng bộ: {formatNumber(ytSynced.liked)} bài đã thích ·{" "}
                    {formatNumber(ytSynced.subscriptions)} kênh đăng ký ·{" "}
                    {formatNumber(ytSynced.artists)} nghệ sĩ vào gu.
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  {data.youtube.needsReauth ? (
                    <Pressable
                      onPress={linkYoutube}
                      style={({ pressed }) => [
                        styles.primary,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.primaryLabel}>Cấp quyền lại</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => void syncYoutube()}
                      disabled={ytBusy}
                      style={({ pressed }) => [
                        styles.chip,
                        ytBusy && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {ytBusy ? (
                        <ActivityIndicator
                          color={colors.accentText}
                          size="small"
                        />
                      ) : null}
                      <Text style={styles.chipLabel}>
                        {ytBusy ? "Đang đồng bộ" : "Đồng bộ lại gu nhạc"}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={unlinkYoutube}
                    disabled={ytBusy}
                    style={({ pressed }) => [
                      styles.ghost,
                      ytBusy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.rowMeta, styles.warn]}>
                      Bỏ liên kết
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.note}>
                  Nối tài khoản YouTube để radio bám theo gu nhạc của bạn — video
                  đã thích và kênh đã đăng ký.
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={linkYoutube}
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.chipLabel}>+ Nối YouTube</Text>
                  </Pressable>
                </View>
                <Text style={styles.rowMeta}>
                  Cấp quyền xong thì đóng tab trình duyệt để quay lại đây.
                </Text>
              </>
            )}
            {ytError !== null ? (
              <Text style={[styles.rowMeta, styles.warn]}>{ytError}</Text>
            ) : null}
          </View>
        </>
      ) : null}

      <Pressable
        onPress={signOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <Text style={styles.signOutLabel}>Đăng xuất</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xxl,
  },
  note: {
    color: colors.muted,
    fontSize: font.sm,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowEnd: {
    alignItems: "flex-end",
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: font.md,
  },
  rowMeta: {
    color: colors.subtle,
    fontSize: font.xs,
  },
  warn: {
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipLabel: {
    color: colors.text,
    fontSize: font.sm,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryLabel: {
    color: onAccent,
    fontSize: font.sm,
    fontWeight: "600",
  },
  ghost: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  disabled: {
    opacity: 0.5,
  },
  signOut: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  signOutLabel: {
    color: colors.accent,
    fontSize: font.md,
    fontWeight: "600",
  },
});
