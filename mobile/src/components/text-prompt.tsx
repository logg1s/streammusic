import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { errorMessage } from "@/lib/use-api";
import { colors, font, onAccent, radius, spacing } from "@/theme";

/**
 * Hộp nhập một dòng chữ.
 *
 * React Native không có `prompt()`, mà đặt tên playlist thì màn hình nào cũng cần — gom
 * vào đây để câu chữ và cách báo lỗi không mỗi nơi một kiểu.
 *
 * `onSubmit` được phép ném: hộp giữ nguyên chữ đã gõ và hiện lỗi ngay dưới ô nhập, người
 * dùng sửa rồi gửi lại. Đóng hộp khi lỗi thì họ phải gõ lại từ đầu.
 *
 * Nơi gọi chỉ dựng hộp khi mở (`{mo ? <TextPrompt … /> : null}`) — mỗi lượt mở là một
 * lần mount, nên chữ của lần trước tự mất mà không cần effect dọn dẹp.
 */
export function TextPrompt({
  title,
  hint,
  placeholder,
  initialValue = "",
  confirmLabel = "Lưu",
  onSubmit,
  onClose,
}: {
  title: string;
  hint?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();

  const submit = async () => {
    if (busy || trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={busy ? undefined : onClose}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        {/* Bấm trong khung không được đóng hộp — Pressable lồng nuốt cú chạm. */}
        <Pressable style={styles.panel} onPress={() => undefined}>
          <Text style={styles.title}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}

          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.subtle}
            style={styles.input}
            autoFocus
            editable={!busy}
            returnKeyType="done"
            selectionColor={colors.accent}
            onSubmitEditing={() => void submit()}
          />

          {error !== null ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.ghost,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.ghostLabel}>Huỷ</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => void submit()}
              disabled={busy || trimmed.length === 0}
              style={({ pressed }) => [
                styles.button,
                styles.confirm,
                (busy || trimmed.length === 0) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={onAccent} size="small" />
              ) : (
                <Text style={styles.confirmLabel}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  panel: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: font.lg,
    fontWeight: "700",
  },
  hint: {
    color: colors.subtle,
    fontSize: font.xs,
  },
  input: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: font.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: font.xs,
  },
  actions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  button: {
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ghost: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ghostLabel: {
    color: colors.muted,
    fontSize: font.sm,
    fontWeight: "600",
  },
  confirm: {
    backgroundColor: colors.accent,
  },
  confirmLabel: {
    color: onAccent,
    fontSize: font.sm,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
});
