import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Khởi tạo lười (lazy) bằng hàm — KHÔNG dùng Proxy wrapper.
 *
 * Hai lý do:
 *  1. `neon()` ném lỗi nếu DATABASE_URL chưa có; Next.js chạy code top-level lúc build
 *     nên khởi tạo ngay sẽ làm hỏng `next build` ở lần deploy đầu.
 *  2. Auth.js/Drizzle adapter kiểm tra thuộc tính của đối tượng db; Proxy chặn các phép
 *     kiểm tra đó và làm request treo mà không báo lỗi.
 */

type Database = ReturnType<typeof createDb>;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Thiếu DATABASE_URL. Chạy `vercel env pull .env.local --yes` hoặc điền tay vào .env.local",
    );
  }
  return drizzle(neon(url), { schema });
}

let cached: Database | null = null;

export function getDb(): Database {
  if (!cached) cached = createDb();
  return cached;
}

export { schema };
