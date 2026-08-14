import { createHash } from "node:crypto";
import { put } from "@vercel/blob";

export function hashPicture(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function extensionFor(format: string): string {
  if (format.includes("png")) return "png";
  if (format.includes("webp")) return "webp";
  if (format.includes("gif")) return "gif";
  return "jpg";
}

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Đưa ảnh bìa lên Vercel Blob và trả URL công khai.
 *
 * Đặt tên file theo hash nội dung nên cùng một ảnh bìa của cả album chỉ tốn
 * một lần upload. Trả null nếu chưa cấu hình Blob — thiếu ảnh bìa không đáng
 * để làm hỏng cả lần quét.
 */
export async function uploadCover(
  data: Uint8Array,
  format: string,
  hash: string,
): Promise<string | null> {
  if (!isBlobConfigured()) return null;

  try {
    const blob = await put(
      `covers/${hash}.${extensionFor(format)}`,
      Buffer.from(data),
      {
        access: "public",
        contentType: format,
        // Cùng hash = cùng nội dung → ghi đè vào đúng đường dẫn cũ thay vì tạo bản sao.
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31_536_000,
      },
    );
    return blob.url;
  } catch (error) {
    console.error("Upload ảnh bìa thất bại:", error);
    return null;
  }
}
