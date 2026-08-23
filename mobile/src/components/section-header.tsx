import { Ionicons } from "@expo/vector-icons";
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
  actionExpanded,
}: {
  label: string;
  /** Chỉ hiện khi có cả `onAction`, ví dụ "Xem tất cả". */
  actionLabel?: string;
  onAction?: () => void;
  actionExpanded?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${label}`}
          accessibilityState={actionExpanded === undefined ? undefined : { expanded: actionExpanded }}
          onPress={onAction}
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
        >
          <Text style={styles.action}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={15}
            color={colors.accentText}
            style={actionExpanded ? styles.actionIconExpanded : undefined}
          />
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
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.text,
    fontSize: font.lg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  action: {
    color: colors.accentText,
    fontSize: font.sm,
    fontWeight: "700",
  },
  actionButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  actionIconExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  actionPressed: {
    opacity: 0.6,
  },
});
