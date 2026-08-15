import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "@/theme";

/**
 * Ảnh bìa, có ô dự phòng khi không có ảnh.
 *
 * Nhạc quét từ kho lưu trữ rất hay thiếu ảnh nhúng, nên nhánh dự phòng là đường chạy
 * thường xuyên chứ không phải ngoại lệ: vẽ chữ đầu của tên trên nền `surface` để mắt
 * vẫn phân biệt được các dòng, thay vì một ô xám trống trơn.
 */
export function Artwork({
  url,
  name,
  size,
  rounded = "md",
}: {
  url: string | null;
  /** Lấy chữ đầu cho ô dự phòng — tên bài, tên album hay tên nghệ sĩ đều được. */
  name: string;
  size: number;
  rounded?: keyof typeof radius;
}) {
  const borderRadius = radius[rounded];

  if (url === null) {
    const first = name.trim()[0];
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius },
        ]}
      >
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.38) }]}>
          {first ? first.toUpperCase() : "?"}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius }}
      contentFit="cover"
      transition={160}
      // Ảnh bìa gần như không đổi, nhưng hàng đợi thì cuộn qua lại liên tục.
      cachePolicy="memory-disk"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  initial: {
    color: colors.subtle,
    fontWeight: "700",
  },
});
