/**
 * Bảng màu và thang đo dùng chung cho toàn app.
 *
 * Là nguồn duy nhất: không màn hình nào được viết mã màu hay số đo thẳng vào
 * `StyleSheet`. Ba lát cắt (giao diện, thanh phát, radio) chạy song song nên chỉ cần
 * một chỗ đặt hằng số là ba bên không lệch nhau.
 */

export const colors = {
  bg: "#0b0b0f",
  surface: "#16161d",
  /** Nền nổi hơn `surface` một bậc — thẻ, nút tròn, ô nhập trên surface. */
  surfaceElevated: "#1f1f29",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  /** #71717a chỉ đạt 4.12 trên nền tối — dưới chuẩn AA cho chữ thường. */
  subtle: "#8a8a94",
  accent: "#f43f5e",
  /** Nền nhấn mờ cho trạng thái đang chọn/đang phát — accent 14% trên nền tối. */
  accentSoft: "rgba(244, 63, 94, 0.14)",
  /**
   * Màu nhấn dùng làm CHỮ trên nền tối (hồng nhạt, rose-300).
   * `accent` là màu NỀN của nút; đặt nguyên nó lên nền tối thì vẫn đạt AA nhưng
   * lệch hẳn với bản web, nên chữ nhấn đi lối riêng — giống `--accent-text` bên web.
   */
  accentText: "#fda4af",
  /** Lỗi và cảnh báo. Tách khỏi `accent` để cảnh báo không lẫn với chỗ đang nhấn. */
  danger: "#f87171",
  border: "#27272a",
} as const;

/** Chữ và icon nằm TRÊN nền `accent` — trắng đặc để đủ tương phản với hồng đậm. */
export const onAccent = "#ffffff";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
} as const;

export const font = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

/**
 * Chiều cao hai dải chrome cố định ở đáy màn hình.
 *
 * Thanh phát được mount một lần ở layout gốc và tự định vị theo `tabBarHeight`, còn
 * `Screen` cộng cả hai vào padding đáy — thiếu bước đó thì bài cuối danh sách nằm
 * dưới thanh phát và không bao giờ bấm được.
 */
export const layout = {
  tabBarHeight: 56,
  playerBarHeight: 64,
} as const;
