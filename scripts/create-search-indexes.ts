import { neon } from "@neondatabase/serverless";

/**
 * Extension và index cho tìm kiếm.
 *
 * Tách khỏi `drizzle-kit push` vì drizzle-kit không tạo được EXTENSION, mà index
 * trgm lại phụ thuộc vào extension đó. Chạy một lần sau lần push đầu tiên:
 *   npm run db:index
 */
const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,

  `CREATE EXTENSION IF NOT EXISTS unaccent`,

  `CREATE INDEX IF NOT EXISTS tracks_title_trgm
     ON tracks USING gin (title gin_trgm_ops)`,

  `CREATE INDEX IF NOT EXISTS tracks_artist_name_trgm
     ON tracks USING gin (artist_name gin_trgm_ops)`,

  `CREATE INDEX IF NOT EXISTS tracks_album_name_trgm
     ON tracks USING gin (album_name gin_trgm_ops)`,

  `CREATE INDEX IF NOT EXISTS albums_title_trgm
     ON albums USING gin (title gin_trgm_ops)`,

  `CREATE INDEX IF NOT EXISTS artists_name_trgm
     ON artists USING gin (name gin_trgm_ops)`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL");

  const sql = neon(url);
  for (const statement of STATEMENTS) {
    await sql.query(statement);
    console.log("✓", statement.split("\n")[0].trim());
  }
  console.log("\nXong. Tìm kiếm ILIKE giờ đã có index trgm hỗ trợ.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
