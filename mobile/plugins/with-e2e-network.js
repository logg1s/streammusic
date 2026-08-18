const { withAndroidManifest } = require("expo/config-plugins");

/** Cho APK E2E gọi Next local; prebuild production kế tiếp sẽ xoá thuộc tính này. */
module.exports = function withE2ENetwork(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0]?.$;
    if (!application) throw new Error("AndroidManifest thiếu application");
    if (process.env.EXPO_PUBLIC_VONG_E2E === "1") {
      application["android:usesCleartextTraffic"] = "true";
    } else {
      delete application["android:usesCleartextTraffic"];
    }
    return mod;
  });
};
