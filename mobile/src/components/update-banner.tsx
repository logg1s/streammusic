import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type { LatestRelease } from "@vong/shared";
import { isNewerVersion, isVongReleaseUrl } from "@vong/shared";
import { apiJson } from "@/lib/api";
import { colors, font, onAccent, radius, spacing } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DISMISSED_KEY = "vong-dismissed-update";

export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    let alive = true;
    const current = Constants.expoConfig?.version ?? "0.0.0";
    Promise.all([
      apiJson<LatestRelease>("/api/releases/latest"),
      AsyncStorage.getItem(DISMISSED_KEY),
    ])
      .then(([latest, dismissed]) => {
        if (
          alive &&
          latest.androidUrl &&
          isVongReleaseUrl(latest.androidUrl) &&
          isNewerVersion(latest.version, current) &&
          dismissed !== latest.version
        ) {
          setRelease(latest);
        }
      })
      .catch(() => {
        // Mất GitHub/API không được làm app mất chức năng nghe nhạc.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!release?.androidUrl) return null;
  const downloadUrl = release.androidUrl;

  return (
    <View style={[styles.banner, { top: insets.top + spacing.sm }]}>
      <Ionicons name="cloud-download-outline" size={22} color={colors.accentText} />
      <View style={styles.body}>
        <Text style={styles.title}>Có Vọng {release.version}</Text>
        <Text style={styles.hint} numberOfLines={1}>
          Bản Android mới đã sẵn sàng trên GitHub.
        </Text>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Tải bản cập nhật"
        onPress={() => void Linking.openURL(downloadUrl)}
        style={styles.download}
      >
        <Text style={styles.downloadText}>Tải xuống</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Để sau"
        hitSlop={spacing.sm}
        onPress={() => {
          void AsyncStorage.setItem(DISMISSED_KEY, release.version);
          setRelease(null);
        }}
        style={styles.close}
      >
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    zIndex: 1000,
    elevation: 12,
    left: spacing.lg,
    right: spacing.lg,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  body: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: font.sm, fontWeight: "600" },
  hint: { color: colors.subtle, fontSize: font.xs },
  download: {
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  downloadText: { color: onAccent, fontSize: font.xs, fontWeight: "600" },
  close: {
    width: 28,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
