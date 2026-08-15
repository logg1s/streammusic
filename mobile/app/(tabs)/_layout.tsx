import { Link } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, layout, spacing } from "@/theme";

/**
 * Năm tab chính. "Nghệ sĩ" cũng nằm trong nhóm này nhưng `href: null` để nó không
 * chiếm ô trên thanh tab — vào từ trang chủ hoặc từ chi tiết album là đủ, sáu ô thì
 * chữ tiếng Việt bắt đầu bị cắt.
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
          <Link href="/settings" style={styles.headerLink}>
            Cài đặt
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
        tabBarLabelStyle: { fontSize: font.xs },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Trang chủ",
          tabBarIcon: ({ color }) => <TabGlyph shape="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tracks"
        options={{
          title: "Bài hát",
          tabBarIcon: ({ color }) => <TabGlyph shape="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Tìm kiếm",
          tabBarIcon: ({ color }) => <TabGlyph shape="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="albums"
        options={{
          title: "Album",
          tabBarIcon: ({ color }) => <TabGlyph shape="disc" color={color} />,
        }}
      />
      <Tabs.Screen
        name="playlists"
        options={{
          title: "Playlist",
          tabBarIcon: ({ color }) => <TabGlyph shape="queue" color={color} />,
        }}
      />
      <Tabs.Screen name="artists" options={{ title: "Nghệ sĩ", href: null }} />
    </Tabs>
  );
}

type Glyph = "home" | "list" | "search" | "disc" | "queue";

/**
 * Biểu tượng tab vẽ bằng `View`.
 *
 * Workspace này không có bộ icon font nào, và kéo thêm một bộ chỉ để lấy năm hình thì
 * đắt hơn là dựng chúng bằng hình khối — vẽ tay còn ăn màu `tabBarActiveTintColor`
 * chính xác mà không cần map tên icon.
 */
function TabGlyph({ shape, color }: { shape: Glyph; color: ColorValue }) {
  if (shape === "home") {
    return (
      <View style={[glyph.box, glyph.grid]}>
        {[0, 1, 2, 3].map((cell) => (
          <View key={cell} style={[glyph.cell, { backgroundColor: color }]} />
        ))}
      </View>
    );
  }

  if (shape === "list") {
    return (
      <View style={[glyph.box, glyph.stack]}>
        <View style={[glyph.bar, { width: 18, backgroundColor: color }]} />
        <View style={[glyph.bar, { width: 13, backgroundColor: color }]} />
        <View style={[glyph.bar, { width: 18, backgroundColor: color }]} />
      </View>
    );
  }

  if (shape === "search") {
    return (
      <View style={glyph.box}>
        <View style={[glyph.ring, { borderColor: color }]} />
        <View style={[glyph.handle, { backgroundColor: color }]} />
      </View>
    );
  }

  if (shape === "disc") {
    return (
      <View style={[glyph.box, glyph.centered]}>
        <View style={[glyph.disc, { borderColor: color }]} />
        <View style={[glyph.spindle, { backgroundColor: color }]} />
      </View>
    );
  }

  return (
    <View style={[glyph.box, glyph.stack]}>
      <View style={[glyph.bar, { width: 18, backgroundColor: color }]} />
      <View style={[glyph.bar, { width: 18, backgroundColor: color }]} />
      <View style={glyph.queueRow}>
        <View style={[glyph.bar, { width: 9, backgroundColor: color }]} />
        <View style={[glyph.dot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerLink: {
    color: colors.accent,
    fontSize: font.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});

const glyph = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    paddingTop: 1,
  },
  cell: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
  },
  stack: {
    justifyContent: "center",
    gap: 4,
    paddingLeft: 1,
  },
  bar: {
    height: 2,
    borderRadius: 1,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ring: {
    position: "absolute",
    top: 1,
    left: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  handle: {
    position: "absolute",
    right: 1,
    bottom: 2,
    width: 7,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }],
  },
  disc: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  spindle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
