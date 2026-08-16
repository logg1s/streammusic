import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Test đơn vị cho logic thuần dùng chung: store phát nhạc, luật autoplay, parser
 * metadata, và trộn kết quả tìm kiếm. Không đụng DOM/DB/mạng — môi trường node.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/shared/src/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
