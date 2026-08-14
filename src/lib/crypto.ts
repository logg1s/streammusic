import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Mã hoá OAuth refresh/access token trước khi lưu vào Postgres.
 *
 * Định dạng lưu trữ: `iv:authTag:ciphertext`, tất cả base64.
 * Dùng AES-256-GCM nên vừa bảo mật vừa phát hiện được dữ liệu bị sửa đổi.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bit — độ dài khuyến nghị cho GCM

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Thiếu biến môi trường ENCRYPTION_KEY. Tạo bằng: openssl rand -base64 32",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY phải giải mã base64 ra đúng 32 byte, hiện tại là ${key.length} byte.`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Chuỗi mã hoá sai định dạng (cần iv:tag:ciphertext).");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Tiện dụng cho cột nullable (refresh_token có thể không có). */
export function encryptOptional(value: string | null | undefined): string | null {
  return value ? encryptSecret(value) : null;
}

export function decryptOptional(value: string | null | undefined): string | null {
  return value ? decryptSecret(value) : null;
}
