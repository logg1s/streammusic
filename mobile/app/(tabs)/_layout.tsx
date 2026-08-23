import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Image, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, layout, spacing } from "@/theme";

/**
 * Năm tab chính. "Nghệ sĩ" cũng nằm trong nhóm này nhưng `href: null` để nó không
 * chiếm ô trên thanh tab — vào từ trang chủ hoặc từ chi tiết album là đủ, sáu ô thì
 * chữ tiếng Việt bắt đầu bị cắt.
 *
 * Icon lấy từ Ionicons (đi kèm `@expo/vector-icons`): cặp outline/filled đổi theo
 * trạng thái focus nên nhìn rõ tab nào đang mở mà không cần thêm chỉ báo nào khác.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: {
          color: colors.text,
          fontSize: font.xl,
          fontWeight: "700",
        },
        headerTitleAlign: "left",
        headerShadowVisible: false,
        headerRight: () => (
          <Link
            href="/settings"
            style={styles.headerLink}
            accessibilityLabel="Cài đặt"
          >
            <Ionicons
              name="settings-outline"
              size={22}
              color={colors.muted}
            />
          </Link>
        ),
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          // Chiều cao ghim tường minh vì thanh phát ở layout gốc định vị theo
          // `layout.tabBarHeight` — để react-navigation tự tính là hai bên lệch nhau.
          height: layout.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: spacing.xs,
        },
        tabBarLabelStyle: { fontSize: font.xs, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Trang chủ",
          headerTitle: () => (
            <Image
              source={require("../../assets/vong-wordmark.png")}
              resizeMode="contain"
              accessibilityLabel="Vọng"
              style={styles.wordmark}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Tìm kiếm",
          tabBarIcon: ({ color }) => (
            <Ionicons name="search" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Thư viện",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "library" : "library-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="tracks" options={{ title: "Bài hát", href: null }} />
      <Tabs.Screen
        name="albums"
        options={{
          title: "Album",
          href: null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "disc" : "disc-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="playlists"
        options={{
          title: "Playlist",
          href: null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "list" : "list-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="artists" options={{ title: "Nghệ sĩ", href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    width: 84,
    height: 38,
  },
  headerLink: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
