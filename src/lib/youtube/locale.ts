/**
 * Vùng và ngôn ngữ xin từ YouTube.
 *
 * Phải ghim tay ở một chỗ duy nhất: Data API mặc định theo IP máy gọi, còn InnerTube
 * cũng đoán theo IP — nên khi app chạy trên máy chủ ở Mỹ thì hàng gợi ý trang chủ
 * trả về toàn playlist Mỹ ("Country Summer", "Yacht Rock Classics"…), đo được trên
 * bản deploy. Ghim VN/vi để kết quả giống nhau bất kể app đang chạy ở đâu.
 */
export const REGION_CODE = "VN";
export const LANGUAGE_CODE = "vi";
