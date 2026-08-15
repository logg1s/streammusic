import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AlbumSummary } from "@vong/shared";
import { Artwork } from "@/components/artwork";
import { colors, font, spacing } from "@/theme";

/** Bề rộng một thẻ album trong dải cuộn ngang ở trang chủ. */
export const ALBUM_CARD_WIDTH = 132;

export const AlbumCard = memo(function AlbumCard({
  album,
  width = ALBUM_CARD_WIDTH,
}: {
  album: AlbumSummary;
  width?: number;
}) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/albums/[id]", params: { id: album.id } })
      }
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <Artwork url={album.coverUrl} name={album.title} size={width} />
      <Text numberOfLines={1} style={styles.title}>
        {album.title}
      </Text>
      <Text numberOfLines={1} style={styles.subtitle}>
        {album.artistName ?? "Không rõ nghệ sĩ"}
      </Text>
    </Pressable>
  );
});

/** Dòng ngang cho danh sách nghệ sĩ — cùng nhịp thẻ album nhưng ảnh tròn. */
export const ArtistRow = memo(function ArtistRow({
  artist,
}: {
  artist: { id: string; name: string; trackCount: number };
}) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/artists/[id]", params: { id: artist.id } })
      }
      style={({ pressed }) => [styles.artistRow, pressed && styles.pressed]}
    >
      <Artwork url={null} name={artist.name} size={44} rounded="full" />
      <View style={styles.artistBody}>
        <Text numberOfLines={1} style={styles.artistName}>
          {artist.name}
        </Text>
        <Text style={styles.subtitle}>{artist.trackCount} bài</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.65,
  },
  title: {
    color: colors.text,
    fontSize: font.sm,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.subtle,
    fontSize: font.xs,
    marginTop: 2,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: 60,
  },
  artistBody: {
    flex: 1,
    gap: 2,
  },
  artistName: {
    color: colors.text,
    fontSize: font.md,
  },
});
