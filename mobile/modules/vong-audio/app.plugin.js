// Config plugin của module: tự khai quyền và service vào manifest khi prebuild, để app
// không phải sửa `AndroidManifest.xml` bằng tay (prebuild --clean là mất hết sửa tay).
//
// `FOREGROUND_SERVICE_MEDIA_PLAYBACK` là bắt buộc từ Android 14 (API 34): thiếu nó
// `startForeground` với type `mediaPlayback` ném `SecurityException`. `POST_NOTIFICATIONS`
// cần từ Android 13 để notification của MediaSession hiện được.
const { AndroidConfig, withAndroidManifest, withPlugins } = require("expo/config-plugins");

const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS",
];

const SERVICE_NAME = "app.vong.audio.VongAudioService";

/** Khai `MediaSessionService` — không có nó thì hệ thống không nối được media button. */
function withVongAudioService(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.service = (application.service ?? []).filter(
      (service) => service.$["android:name"] !== SERVICE_NAME,
    );
    application.service.push({
      $: {
        "android:name": SERVICE_NAME,
        "android:exported": "true",
        "android:foregroundServiceType": "mediaPlayback",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "androidx.media3.session.MediaSessionService" } }],
        },
      ],
    });
    return cfg;
  });
}

module.exports = function withVongAudio(config) {
  return withPlugins(config, [
    [AndroidConfig.Permissions.withPermissions, PERMISSIONS],
    withVongAudioService,
  ]);
};
