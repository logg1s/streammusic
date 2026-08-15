import { useEffect } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";
import {
  DarkTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from "expo-router";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { PlaybackEngine } from "@/components/player/playback-engine";
import { PlayerBar } from "@/components/player/player-bar";
import { useSession } from "@/lib/api";
import { colors, font, layout } from "@/theme";

/**
 * Chủ đề của navigator.
 *
 * Phải đặt tường minh: mặc định của react-navigation là nền sáng, nên mỗi lần đẩy màn
 * hình sẽ loé một khung trắng trước khi nội dung tối vẽ lên.
 */
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        {/*
          Máy phát nằm ngoài cổng đăng nhập và ngoài navigator: điều hướng không được
          làm nó remount, nếu không tiếng đứt giữa bài. Nó tự render null.
        */}
        <PlaybackEngine />
        <SessionGate />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Cổng đăng nhập.
 *
 * `token === null` nghĩa là chưa đăng nhập (SecureStore trống, hoặc Keystore đã mất
 * khoá sau khi cài lại app) — đẩy về `/login`. Điều hướng làm trong effect chứ không
 * render `<Redirect>`: lúc `loading` còn true cây này chưa có navigator nào, gọi
 * `replace` ở đó là ném "Attempted to navigate before mounting the Root Layout".
 */
function SessionGate() {
  const { token, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const root = segments[0];
  const onLogin = root === "login";

  useEffect(() => {
    if (loading) return;
    if (token === null) {
      if (!onLogin) router.replace("/login");
      return;
    }
    if (onLogin) router.replace("/");
  }, [loading, token, onLogin, router]);

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Thanh phát nổi trên thanh tab khi đang ở trong nhóm `(tabs)`; ở màn hình chi tiết
  // đẩy trên Stack gốc thì không có thanh tab nên nó tụt xuống sát mép an toàn.
  const showBar = token !== null && !onLogin && root !== "player";
  const barBottom =
    insets.bottom + (root === "(tabs)" ? layout.tabBarHeight : 0);

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: {
            color: colors.text,
            fontSize: font.lg,
            fontWeight: "600",
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: false, animation: "fade" }}
        />
        <Stack.Screen
          name="auth"
          options={{ headerShown: false, animation: "none" }}
        />
        <Stack.Screen
          name="player"
          options={{
            headerShown: false,
            presentation: "modal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen name="settings" options={{ title: "Cài đặt" }} />
        <Stack.Screen name="albums/[id]" options={{ title: "Album" }} />
        <Stack.Screen name="artists/[id]" options={{ title: "Nghệ sĩ" }} />
        <Stack.Screen name="playlists/[id]" options={{ title: "Playlist" }} />
      </Stack>

      {showBar ? (
        <View
          // `box-none` để những chỗ trống hai bên thanh phát không ăn cú bấm của danh sách.
          pointerEvents="box-none"
          style={[styles.barHost, { bottom: barBottom }]}
        >
          <PlayerBar />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  barHost: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
