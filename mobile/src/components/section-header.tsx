import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, spacing } from "@/theme";

/**
 * Tiêu đề một dải nội dung: chữ nhỏ, in hoa, giãn ký tự — cùng một nhịp với dải
 * "eyebrow" của bản web nên hai vỏ đọc ra giống nhau.
 */
export function SectionHeader({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  /** Chỉ hiện khi có cả `onAction`, ví dụ "Xem tất cả". */
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={spacing.sm}
          style={({ pressed }) => (pressed ? styles.actionPressed : undefined)}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  label: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  action: {
    color: colors.accent,
    fontSize: font.xs,
  },
  actionPressed: {
    opacity: 0.6,
  },
});
