import { Pressable, StyleSheet, Text, View } from "react-native";
import { ErrorNote, Loading, Screen } from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import {
  CONNECTION_STATUS_LABEL,
  PROVIDER_LABEL,
  formatNumber,
} from "@/lib/format";
import { signOut } from "@/lib/api";
import type { ConnectionsSummary } from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { colors, font, radius, spacing } from "@/theme";

/**
 * Cài đặt: xem kho lưu trữ đã nối, trạng thái tài khoản YouTube, và đăng xuất.
 *
 * Chỉ đọc. Nối thêm kho hay nối YouTube là luồng OAuth nhiều bước, làm trên web rồi
 * app thấy ngay — nhân bản luồng đó vào đây chỉ để bấm một lần là không đáng.
 */
export default function SettingsScreen() {
  const { data, error, loading, reload } = useApi<ConnectionsSummary>(
    "/api/connections",
  );

  return (
    <Screen scroll refreshing={loading} onRefresh={reload}>
      {loading && data === null ? <Loading /> : null}
      {error !== null && data === null ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : null}

      {data !== null ? (
        <>
          <View style={styles.section}>
            <SectionHeader label="Kho lưu trữ" />
            {data.connections.length === 0 ? (
              <Text style={styles.note}>
                Chưa nối kho nào. Mở Vọng trên máy tính, vào Cài đặt · Kết nối để
                nối
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
                    Cần nối lại tài khoản để tiếp tục đồng bộ gu nhạc.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.note}>
                Chưa nối tài khoản YouTube. Nối trên web để gợi ý ăn theo gu nhạc
                của bạn.
              </Text>
            )}
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
    color: colors.accent,
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
