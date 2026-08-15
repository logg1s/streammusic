// App này là React Native, không phải web: bộ quy tắc của `eslint-config-next` ở gốc repo
// bắt lỗi sai chỗ ở đây (đòi `alt` cho `<Image>` của expo-image, và bộ quy tắc của React
// Compiler không hiểu `PanResponder` — handler phải dựng trong render mới cắm được vào
// view). Expo ship sẵn cấu hình đúng cho RN, dùng nó và để gốc repo bỏ qua thư mục này.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["android/**", "ios/**", ".expo/**", "expo-env.d.ts"],
  },
]);
