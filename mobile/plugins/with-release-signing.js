// Config plugin: chèn signing release vào android/app/build.gradle mỗi lần prebuild.
//
// Vì sao cần: `expo prebuild` sinh lại toàn bộ android/, mọi sửa tay đều bị ghi đè.
// Keystore nằm ở mobile/credentials/ (gitignore) — mật khẩu KHÔNG nằm trong repo,
// truyền lúc build: gradlew :app:assembleRelease -PVONG_UPLOAD_STORE_PASSWORD=...
const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_SIGNING = `        release {
            storeFile file('../../credentials/vong-release.jks')
            storePassword findProperty('VONG_UPLOAD_STORE_PASSWORD')
            keyAlias 'vong'
            keyPassword findProperty('VONG_UPLOAD_STORE_PASSWORD')
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (!gradle.includes("vong-release.jks")) {
      // Thêm block release ngay sau block debug trong signingConfigs.
      gradle = gradle.replace(
        /(signingConfigs \{\n        debug \{[\s\S]*?\n        \})/,
        `$1\n${RELEASE_SIGNING}`,
      );
      // buildTypes.release dùng key release thay vì debug.
      gradle = gradle.replace(
        /(release \{\n(?:\s*\/\/[^\n]*\n)*)\s*signingConfig signingConfigs\.debug/,
        "$1            signingConfig signingConfigs.release",
      );
      mod.modResults.contents = gradle;
    }
    return mod;
  });
};
