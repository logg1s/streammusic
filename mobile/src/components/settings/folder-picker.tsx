import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch } from "@/lib/api";
import type { BrowseResult } from "@/lib/dto";
import { errorMessage, useApi } from "@/lib/use-api";
import { colors, font, onAccent, radius, spacing } from "@/theme";

/**
 * Chọn một thư mục trên kho để đưa vào danh sách sẽ quét.
 *
 * Duyệt từng cấp một chứ không tải cả cây: kho nhạc thật có hàng nghìn thư mục, và
 * mỗi cấp là một lượt gọi sang provider — tải trước là bắt người dùng chờ những nhánh
 * họ không bao giờ mở.
 */

interface Entry {
  id: string;
  name: string;
  path: string;
}

export function FolderPicker({
  connectionId,
  onPicked,
}: {
  connectionId: string;
  /** Đã thêm xong một thư mục — màn hình cha đóng picker và tải lại danh sách. */
  onPicked: () => void;
}) {
  const [trail, setTrail] = useState<Entry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = trail.length > 0 ? trail[trail.length - 1] : null;
  // `null` = thư mục gốc. Dropbox dùng chuỗi rỗng cho gốc nên không gộp hai giá trị này.
  const folderId = current?.id ?? null;

  // Thư mục đang mở quyết định nội dung: đổi `path` là `useApi` tải lại một cấp mới, và
  // nó đã lo sẵn phần "kết quả cũ không được nháy lên trong lúc chờ cấp mới".
  const query =
    folderId === null ? "" : `?folderId=${encodeURIComponent(folderId)}`;
  const { data, error: loadError, loading } = useApi<BrowseResult>(
    `/api/connections/${connectionId}/browse${query}`,
  );

  const entries = data?.entries ?? null;
  const error = saveError ?? loadError;

  /** Lỗi lưu thuộc về thư mục lúc bấm, nên rời thư mục là nó hết nghĩa — xoá luôn. */
  const goTo = (next: Entry[]) => {
    setSaveError(null);
    setTrail(next);
  };

  const addCurrent = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/api/connections/${connectionId}/roots`, {
        method: "POST",
        body: JSON.stringify({
          remoteId: current?.id ?? "",
          name: current?.name ?? "Toàn bộ kho",
          path: current?.path ?? "/",
        }),
      });
      onPicked();
    } catch (cause) {
      setSaveError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.trail}>
        <Pressable onPress={() => goTo([])} hitSlop={spacing.xs}>
          <Text style={trail.length === 0 ? styles.crumbHere : styles.crumb}>
            Gốc
          </Text>
        </Pressable>
        {trail.map((entry, index) => (
          <Pressable
            key={entry.id}
            onPress={() => goTo(trail.slice(0, index + 1))}
            hitSlop={spacing.xs}
          >
            <Text
              numberOfLines={1}
              style={index === trail.length - 1 ? styles.crumbHere : styles.crumb}
            >
              {"› "}
              {entry.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.list} nestedScrollEnabled>
        {loading ? (
          <View style={styles.listNote}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && error === null && entries?.length === 0 ? (
          <Text style={styles.hint}>Không có thư mục con ở đây.</Text>
        ) : null}
        {!loading && error === null
          ? entries?.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => goTo([...trail, entry])}
                style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.entryName}>
                  {entry.name}
                </Text>
              </Pressable>
            ))
          : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={addCurrent}
          disabled={loading || saving}
          style={({ pressed }) => [
            styles.confirm,
            (loading || saving) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.confirmLabel}>
            {current ? `Chọn “${current.name}”` : "Chọn toàn bộ kho"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  trail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  crumb: {
    color: colors.subtle,
    fontSize: font.xs,
  },
  crumbHere: {
    color: colors.text,
    fontSize: font.xs,
  },
  list: {
    maxHeight: 240,
  },
  listNote: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  entry: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  entryName: {
    color: colors.text,
    fontSize: font.sm,
  },
  hint: {
    color: colors.subtle,
    fontSize: font.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  error: {
    color: colors.danger,
    fontSize: font.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: "flex-start",
  },
  confirm: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  confirmLabel: {
    color: onAccent,
    fontSize: font.xs,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.6,
  },
});
