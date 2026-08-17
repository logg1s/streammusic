import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DetailHeader } from "@/components/detail-header";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { TextPrompt } from "@/components/text-prompt";
import { TRACK_ROW_HEIGHT, TrackRow } from "@/components/track-row";
import { formatLongDuration, formatNumber } from "@/lib/format";
import type { PlaylistDetail } from "@/lib/dto";
import {
  deletePlaylist,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
} from "@/lib/playlist-actions";
import { errorMessage, useApi } from "@/lib/use-api";
import { colors, font, radius, spacing } from "@/theme";

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<PlaylistDetail>(
    `/api/playlists/${id}`,
  );
  const content = useContentInsets();

  /**
   * Bản chi tiết chụp lại ngay trước một lệnh sửa.
   *
   * `useApi` trả `data === null` suốt lượt gọi lại, mà sửa playlist thì lần nào cũng gọi
   * lại — bám thẳng vào `data` thì bấm ▲ một cái là cả màn hình nháy về vòng quay rồi
   * dựng lại. Bản chụp lấp đúng quãng đó, và nhường chỗ ngay khi dữ liệu mới về.
   */
  const [snapshot, setSnapshot] = useState<PlaylistDetail | null>(null);
  const [renaming, setRenaming] = useState(false);
  /** Chặn bấm chồng: hai lệnh đổi thứ tự gối nhau thì lệnh sau ghi đè bằng thứ tự cũ. */
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const shown = data ?? snapshot;
  const items = useMemo(() => shown?.items ?? [], [shown]);
  // `items` mang thêm `itemId` (khoá của dòng trong playlist) mà player không cần;
  // memo để `TrackRow` không nhận mảng mới sau mỗi lần render và mất `memo`.
  const tracks = useMemo(() => items.map((item) => item.track), [items]);

  /** Chạy một lệnh ghi rồi tải lại; lỗi hiện ngay trên đầu danh sách chứ không im lặng. */
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setSnapshot(shown);
    try {
      await work();
      reload();
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
    setBusy(false);
  };

  /*
   * Đổi chỗ hai bài kề nhau rồi gửi CẢ thứ tự mới: server đòi tập itemId trùng khít tập
   * hiện có, nhờ vậy hai thiết bị mở song song không ghi đè nhau âm thầm.
   */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;

    const itemIds = items.map((item) => item.itemId);
    [itemIds[index], itemIds[target]] = [itemIds[target], itemIds[index]];
    void run(() => reorderPlaylist(id, itemIds));
  };

  const removePlaylist = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await deletePlaylist(id);
      router.back();
    } catch (cause) {
      setActionError(errorMessage(cause));
      setBusy(false);
    }
  };

  /* Alert.alert chứ không phải confirm(): trên React Native `confirm` không tồn tại, và
     xoá playlist là việc không hoàn tác được nên phải có đường lùi. */
  const confirmDelete = (name: string) => {
    Alert.alert("Xoá playlist", `Xoá "${name}"? Không khôi phục lại được.`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: () => {
          void removePlaylist();
        },
      },
    ]);
  };

  if (loading && shown === null) {
    return (
      <Screen scroll>
        <Loading />
      </Screen>
    );
  }

  if (error !== null && shown === null) {
    return (
      <Screen scroll>
        <ErrorNote message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (shown === null) return null;

  const totalSeconds = tracks.reduce(
    (sum, track) => sum + (track.durationSec ?? 0),
    0,
  );
  const subtitle = [
    shown.playlist.seedLabel,
    `${formatNumber(tracks.length)} bài`,
    formatLongDuration(totalSeconds),
  ]
    .filter((part): part is string => part !== null)
    .join("  ·  ");

  return (
    <Screen>
      <Stack.Screen options={{ title: shown.playlist.name }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.itemId}
        renderItem={({ item, index }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemTrack}>
              <TrackRow track={item.track} tracks={tracks} index={index} />
            </View>
            <IconAction
              label={`Đưa ${item.track.title} lên trên`}
              icon="chevron-up"
              disabled={busy || index === 0}
              onPress={() => move(index, -1)}
            />
            <IconAction
              label={`Đưa ${item.track.title} xuống dưới`}
              icon="chevron-down"
              disabled={busy || index === items.length - 1}
              onPress={() => move(index, 1)}
            />
            <IconAction
              label={`Xoá ${item.track.title} khỏi playlist`}
              icon="close"
              disabled={busy}
              color={colors.danger}
              onPress={() => void run(() => removeFromPlaylist(id, item.itemId))}
            />
          </View>
        )}
        contentContainerStyle={content}
        getItemLayout={(_, index) => ({
          length: TRACK_ROW_HEIGHT,
          offset: TRACK_ROW_HEIGHT * index,
          index,
        })}
        ListHeaderComponent={
          <View>
            <DetailHeader
              coverUrl={tracks[0]?.coverUrl ?? null}
              title={shown.playlist.name}
              subtitle={subtitle}
              tracks={tracks}
            />
            <View style={styles.actions}>
              <TextAction
                label="Đổi tên"
                icon="pencil"
                disabled={busy}
                onPress={() => setRenaming(true)}
              />
              <TextAction
                label="Xoá playlist"
                icon="trash"
                disabled={busy}
                color={colors.danger}
                onPress={() => confirmDelete(shown.playlist.name)}
              />
            </View>
            {actionError !== null ? (
              <Text style={styles.error}>{actionError}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyNote
            title="Playlist này đang trống"
            hint="Nhấn giữ một dòng bài ở bất kỳ đâu trong app để thêm vào đây."
          />
        }
      />

      {renaming ? (
        <TextPrompt
          title="Đổi tên playlist"
          placeholder="Tên playlist"
          initialValue={shown.playlist.name}
          onSubmit={async (name) => {
            await renamePlaylist(id, name);
            setSnapshot(shown);
            reload();
          }}
          onClose={() => setRenaming(false)}
        />
      ) : null}
    </Screen>
  );
}

/** Nút chỉ có icon, đứng cạnh một dòng bài. */
function IconAction({
  label,
  icon,
  disabled,
  color = colors.muted,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled: boolean;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

/** Nút icon kèm chữ trong dải hành động dưới đầu trang. */
function TextAction({
  label,
  icon,
  disabled,
  color = colors.muted,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled: boolean;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.textActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemTrack: {
    flex: 1,
  },
  iconButton: {
    width: 30,
    height: TRACK_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  textAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textActionLabel: {
    fontSize: font.sm,
    fontWeight: "600",
  },
  error: {
    color: colors.danger,
    fontSize: font.sm,
    marginBottom: spacing.md,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
});
