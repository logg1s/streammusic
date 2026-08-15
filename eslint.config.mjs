import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Rust sinh sẵn script glue của Tauri ở đây; không phải code của mình.
    "src-tauri/target/**",
    // App React Native có bộ quy tắc riêng (`mobile/eslint.config.js`): quy tắc web ở
    // đây bắt lỗi sai chỗ trong RN.
    "mobile/**",
  ]),
]);

export default eslintConfig;
