import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, layout, onAccent, radius, spacing } from "@/theme";

/**
 * Khung ngoài của mọi màn hình, cộng ba trạng thái mà màn hình nào cũng phải có
 * (đang tải / lỗi / trống). Gom vào một chỗ để câu chữ tiếng Việt không mỗi màn hình
 * một kiểu.
 */

/**
 * Padding của vùng nội dung.
 *
 * Đáy phải chừa đủ cho thanh phát, và chừa thêm thanh tab nếu màn hình nằm trong nhóm
 * `(tabs)` — thiếu thì bài cuối danh sách nằm dưới chrome và không bấm được. Màn hình
 * chi tiết đẩy trên Stack gốc không có thanh tab nên không cộng phần đó.
 */
export function useContentInsets() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const insideTabs = segments[0] === "(tabs)";

  return useMemo(
    () => ({
      paddingTop: spacing.xl,
      paddingHorizontal: spacing.xl,
      paddingBottom:
        insets.bottom +
        layout.playerBarHeight +
        (insideTabs ? layout.tabBarHeight : 0) +
        spacing.lg,
    }),
    [insets.bottom, insideTabs],
  );
}

export interface ScreenProps {
  children: ReactNode;
  /** Bọc nội dung trong `ScrollView`. Danh sách dài thì để `false` và tự dựng `FlatList`. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({
  children,
  scroll = false,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const content = useContentInsets();

  if (!scroll) {
    return <View style={styles.root}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={content}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Dải thông số nhỏ dưới tiêu đề: "1.204 bài · 87 album · …". */
export function Readout({ text }: { text: string }) {
  return <Text style={styles.readout}>{text}</Text>;
}

export function Loading({ label = "Đang tải…" }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.centerHint}>{label}</Text>
    </View>
  );
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Thử lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyNote({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.centerHint}>{hint}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  centerHint: {
    color: colors.subtle,
    fontSize: font.sm,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.lg,
    fontWeight: "600",
    textAlign: "center",
  },
  errorText: {
    color: colors.muted,
    fontSize: font.md,
    textAlign: "center",
  },
  readout: {
    color: colors.subtle,
    fontSize: font.xs,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: onAccent,
    fontSize: font.sm,
    fontWeight: "600",
  },
});
