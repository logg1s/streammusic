import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme";

/**
 * Bãi đáp của deep link `vong://auth?code=...`.
 *
 * Việc đổi mã lấy token do `signIn()` làm — nó đọc URL từ `openAuthSessionAsync`, và mã
 * trao tay chỉ dùng được một lần nên ở đây KHÔNG được đổi mã lần nữa.
 *
 * Màn hình này tồn tại vì Android còn gửi chính deep link đó vào app dưới dạng intent,
 * và expo-router lấy đường dẫn đó làm route. Không có file này thì người dùng thấy loé
 * "Unmatched Route" ngay sau khi xác nhận trên browser. Ở đây chỉ quay về trang chủ:
 * cổng đăng nhập trong `_layout` tự đẩy sang `/login` nếu phiên chưa kịp lưu.
 */
export default function AuthLandingScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
