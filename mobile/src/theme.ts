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
  text: "#f4f4f5",
  muted: "#a1a1aa",
  subtle: "#71717a",
  accent: "#f43f5e",
  border: "#27272a",
} as const;

/** Chữ nằm trên nền `accent` — trắng đặc để đủ tương phản với hồng đậm. */
export const accentText = "#ffffff";

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
