import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { ErrorNote, Loading, Screen } from "@/components/screen";
import { SectionHeader } from "@/components/section-header";
import { FolderPicker } from "@/components/settings/folder-picker";
import { apiFetch, apiJson } from "@/lib/api";
import type { ConnectionsSummary, ScanStart, ScanStep } from "@/lib/dto";
import { PROVIDER_LABEL, formatNumber } from "@/lib/format";
import { openOAuthFlow } from "@/lib/oauth";
import { errorMessage, useApi } from "@/lib/use-api";
import { colors, font, onAccent, radius, spacing } from "@/theme";

/**
 * Quản lý kho lưu trữ: nối tài khoản, chọn thư mục sẽ quét, quét, ngắt kết nối.
 *
 * Tách khỏi màn Cài đặt vì đây là chỗ người dùng ở lại vài phút (quét chạy theo lô),
 * còn Cài đặt là chỗ ghé qua.
 */

type ConnectionRow = ConnectionsSummary["connections"][number];

export default function ConnectionsScreen() {
  const { data, error, loading, reload } = useApi<ConnectionsSummary>(
    "/api/connections",
  );

  return (
    <Screen scroll refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: "Kết nối" }} />

      {loading && data === null ? <Loading /> : null}
      {error !== null && data === null ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : null}

      {data !== null ? (
        <>
          <View style={styles.section}>
            <SectionHeader label="Nối tài khoản" />
            {data.available.length === 0 ? (
              <Text style={styles.note}>
                Máy chủ chưa cấu hình nhà cung cấp nào.
              </Text>
            ) : (
              <View style={styles.chips}>
                {data.available.map((provider) => (
                  <Pressable
                    key={provider.id}
                    onPress={() =>
                      void openOAuthFlow(
                        `/api/connections/oauth/${provider.id}/authorize`,
                      ).then(reload)
                    }
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.chipLabel}>+ {provider.displayName}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.hint}>
              Cấp quyền xong thì đóng tab trình duyệt để quay lại đây.
            </Text>
          </View>

          <View style={styles.section}>
            <SectionHeader label="Đã nối" />
            {data.connections.length === 0 ? (
              <Text style={styles.note}>
                Chưa nối kho nào. Chọn một nhà cung cấp ở trên để bắt đầu.
              </Text>
            ) : (
              data.connections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  onChanged={reload}
                />
              ))
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

interface ScanState {
  phase: "listing" | "processing" | "done" | "error";
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  message?: string;
}

/**
 * Số lượt gọi liên tiếp mà máy chủ báo "chưa xong" nhưng không xử lý thêm file nào
 * trước khi bỏ cuộc. Vòng lặp này chạy trên điện thoại: một job kẹt mà cứ gọi mãi là
 * đốt pin và dung lượng 4G của người dùng cho tới khi họ tự tắt app.
 */
const MAX_STALLED_STEPS = 3;

function ConnectionCard({
  connection,
  onChanged,
}: {
  connection: ConnectionRow;
  onChanged: () => void;
}) {
  const [scan, setScan] = useState<ScanState | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Cờ dừng cho vòng lặp quét: rời màn hình hay bấm Dừng đều phải cắt được nó. */
  const stopped = useRef(false);
  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );

  const scanning = scan?.phase === "listing" || scan?.phase === "processing";

  const runScan = async () => {
    stopped.current = false;
    setScan({ phase: "listing", total: 0, processed: 0, skipped: 0, failed: 0 });

    try {
      const start = await apiJson<ScanStart>("/api/scan", {
        method: "POST",
        body: JSON.stringify({ connectionId: connection.id }),
      });
      if (stopped.current) return;

      setScan({
        phase: "processing",
        total: start.totalFiles,
        processed: 0,
        skipped: 0,
        failed: 0,
      });

      // Gọi lặp từng lô: một function trên Vercel không đủ 300s để đọc tag của vài
      // nghìn file, nên client giữ nhịp và hiển thị tiến độ thật.
      let handled = 0;
      let stalled = 0;
      for (;;) {
        if (stopped.current) return;

        const step = await apiJson<ScanStep>(
          `/api/scan/${start.jobId}/step`,
          { method: "POST" },
        );
        if (stopped.current) return;

        const job = step.job;
        if (job) {
          setScan({
            phase: step.done ? "done" : "processing",
            total: job.totalFiles,
            processed: job.processedFiles,
            skipped: job.skippedFiles,
            failed: job.failedFiles,
          });
        }
        // Máy chủ tự báo hết việc — kể cả khi job bị huỷ hoặc hỏng, route trả `done`.
        if (step.done) break;

        // Không có `job` thì không đo được gì, coi như một lượt đứng yên: thà dừng
        // sớm còn hơn tin vào một endpoint không nói được nó đang làm tới đâu.
        const now = job
          ? job.processedFiles + job.skippedFiles + job.failedFiles
          : handled;
        stalled = now > handled ? 0 : stalled + 1;
        handled = now;
        if (stalled >= MAX_STALLED_STEPS) {
          throw new Error(
            "Máy chủ báo chưa quét xong nhưng không xử lý thêm file nào. Đã dừng, thử quét lại sau.",
          );
        }
      }

      onChanged();
    } catch (cause) {
      if (stopped.current) return;
      setScan({
        phase: "error",
        total: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
        message: errorMessage(cause),
      });
    }
  };

  const removeRoot = (rootId: string, name: string) => {
    Alert.alert("Bỏ thư mục", `Không quét “${name}” nữa?`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Bỏ",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void apiFetch(
            `/api/connections/${connection.id}/roots?rootId=${rootId}`,
            { method: "DELETE" },
          )
            .then(onChanged)
            .catch((cause: unknown) => {
              Alert.alert("Không bỏ được thư mục", errorMessage(cause));
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const disconnect = () => {
    Alert.alert(
      `Ngắt ${PROVIDER_LABEL[connection.provider]}?`,
      `Toàn bộ ${formatNumber(connection.trackCount)} bài đã lập chỉ mục từ kho này sẽ bị xoá khỏi thư viện. File gốc trên kho không bị ảnh hưởng.`,
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Ngắt",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void apiFetch(`/api/connections/${connection.id}`, {
              method: "DELETE",
            })
              .then(onChanged)
              .catch((cause: unknown) => {
                Alert.alert("Không ngắt được kết nối", errorMessage(cause));
              })
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>
        {PROVIDER_LABEL[connection.provider]}
      </Text>
      <Text numberOfLines={1} style={styles.cardTitle}>
        {connection.label}
      </Text>
      <Text style={styles.cardMeta}>
        {formatNumber(connection.trackCount)} bài đã lập chỉ mục
      </Text>

      {connection.status === "needs_reauth" ? (
        <Text style={styles.warn}>
          Kho này đã hết quyền truy cập.
          {connection.provider === "google_drive"
            ? " Google thu hồi refresh token sau 7 ngày khi app còn ở chế độ Testing — đây là hành vi bình thường, không phải lỗi."
            : ""}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {connection.status === "needs_reauth" ? (
          <Pressable
            onPress={() =>
              void openOAuthFlow(
                `/api/connections/oauth/${connection.provider}/authorize`,
              ).then(onChanged)
            }
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>Cấp quyền lại</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void runScan()}
            disabled={scanning || busy}
            style={({ pressed }) => [
              styles.chip,
              (scanning || busy) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {scanning ? <ActivityIndicator color={colors.accentText} size="small" /> : null}
            <Text style={styles.chipLabel}>{scanning ? "Đang quét" : "Quét"}</Text>
          </Pressable>
        )}

        {scanning ? (
          <Pressable
            onPress={() => {
              stopped.current = true;
              setScan(null);
            }}
            style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
          >
            <Text style={styles.ghostLabel}>Dừng</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={disconnect}
          disabled={busy}
          style={({ pressed }) => [
            styles.ghost,
            busy && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.ghostLabel, styles.danger]}>Ngắt kết nối</Text>
        </Pressable>
      </View>

      {scan !== null ? <ScanProgress scan={scan} /> : null}

      <View style={styles.roots}>
        <SectionHeader
          label="Thư mục sẽ quét"
          actionLabel={picking ? "Đóng" : "Thêm thư mục"}
          onAction={() => setPicking((v) => !v)}
        />
        {connection.roots.length === 0 ? (
          <Text style={styles.hint}>
            Chưa chọn thư mục nào — lần quét sẽ duyệt toàn bộ kho. Chọn một thư
            mục cụ thể sẽ nhanh hơn nhiều.
          </Text>
        ) : (
          connection.roots.map((root) => (
            <View key={root.id} style={styles.rootRow}>
              <Text numberOfLines={1} style={styles.rootPath}>
                {root.path || root.name}
              </Text>
              <Pressable
                onPress={() => removeRoot(root.id, root.name)}
                disabled={busy}
                hitSlop={spacing.sm}
              >
                <Text style={[styles.ghostLabel, styles.danger]}>Bỏ</Text>
              </Pressable>
            </View>
          ))
        )}

        {picking ? (
          <FolderPicker
            connectionId={connection.id}
            onPicked={() => {
              setPicking(false);
              onChanged();
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function ScanProgress({ scan }: { scan: ScanState }) {
  if (scan.phase === "error") {
    return <Text style={styles.warn}>{scan.message}</Text>;
  }

  const handled = scan.processed + scan.skipped + scan.failed;
  const ratio = scan.total > 0 ? handled / scan.total : 0;

  return (
    <View style={styles.progress}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      <Text style={styles.cardMeta}>
        {scan.phase === "listing"
          ? "Đang liệt kê file…"
          : scan.phase === "done"
            ? `Xong · ${formatNumber(scan.processed)} bài mới · ${formatNumber(scan.skipped)} bỏ qua${scan.failed > 0 ? ` · ${formatNumber(scan.failed)} lỗi` : ""}`
            : `${formatNumber(handled)}/${formatNumber(scan.total)} · ${formatNumber(scan.processed)} bài mới${scan.failed > 0 ? ` · ${formatNumber(scan.failed)} lỗi` : ""}`}
      </Text>
    </View>
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
  hint: {
    color: colors.subtle,
    fontSize: font.xs,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
  ghostLabel: {
    color: colors.subtle,
    fontSize: font.sm,
  },
  danger: {
    color: colors.danger,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: 2,
  },
  cardEyebrow: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  cardTitle: {
    color: colors.text,
    fontSize: font.md,
    marginTop: spacing.xs,
  },
  cardMeta: {
    color: colors.subtle,
    fontSize: font.xs,
  },
  warn: {
    color: colors.danger,
    fontSize: font.xs,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.6,
  },
  progress: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  track: {
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  fill: {
    height: 3,
    backgroundColor: colors.accent,
  },
  roots: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rootRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rootPath: {
    flex: 1,
    color: colors.text,
    fontSize: font.sm,
  },
});
