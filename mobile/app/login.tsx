import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signIn } from "@/lib/api";
import { accentText, colors, font, radius, spacing } from "@/theme";

/**
 * Màn hình đăng nhập.
 *
 * Chỉ một nút: `signIn()` mở Chrome Custom Tabs tới `/api/native/authorize` rồi đổi
 * code lấy JWT phiên. App không tự chạy OAuth Google — Google chặn OAuth trong
 * user-agent nhúng, mà Custom Tabs thì không phải WebView nhúng nên vẫn hợp lệ.
 *
 * Điều hướng ra khỏi đây do cổng phiên ở `app/_layout.tsx` lo: `signIn()` thành công
 * là `useSession` có token, cổng tự `replace("/")`.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignIn() {
    setPending(true);
    setFailed(false);
    try {
      // `false` = người dùng tự đóng trình duyệt, hoặc server không đổi được code.
      if (!(await signIn())) setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxl }]}>
      <View style={styles.brand}>
        <Text style={styles.mark}>Vọng</Text>
        <Text style={styles.tagline}>
          Nhạc của bạn trên Drive, Dropbox hay OneDrive — và cả YouTube — trong
          một chỗ.
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable
          onPress={handleSignIn}
          disabled={pending}
          style={({ pressed }) => [
            styles.button,
            (pressed || pending) && styles.buttonPressed,
          ]}
        >
          {pending ? (
            <ActivityIndicator color={accentText} />
          ) : (
            <Text style={styles.buttonLabel}>Đăng nhập bằng Google</Text>
          )}
        </Pressable>

        {failed ? (
          <Text style={styles.error}>
            Chưa đăng nhập được. Hãy hoàn tất bước xác nhận trên trình duyệt rồi
            thử lại.
          </Text>
        ) : (
          <Text style={styles.hint}>
            Trình duyệt hệ thống sẽ mở ra để bạn xác nhận, rồi tự quay lại app.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: "space-between",
  },
  brand: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
  },
  mark: {
    color: colors.text,
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -1,
  },
  tagline: {
    color: colors.muted,
    fontSize: font.md,
    lineHeight: 22,
  },
  footer: {
    gap: spacing.md,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: accentText,
    fontSize: font.md,
    fontWeight: "700",
  },
  error: {
    color: colors.accent,
    fontSize: font.sm,
    textAlign: "center",
  },
  hint: {
    color: colors.subtle,
    fontSize: font.xs,
    textAlign: "center",
  },
});
