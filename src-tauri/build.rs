/// Khai báo command của app cho ACL.
///
/// Trang được nạp là **remote** (`https://streammusic.vercel.app`), và Tauri chặn mọi
/// command từ origin không phải local trừ khi có app manifest **và** một capability cho
/// origin đó (`crates/tauri/src/webview/mod.rs`: `if plugin_command.is_some() ||
/// has_app_acl_manifest || !is_local`). Thiếu file này thì mọi `invoke` im lặng thất bại.
fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "play_track",
            "stop",
            "pause",
            "resume",
            "seek",
            "set_volume",
        ])),
    )
    .expect("failed to run tauri-build");
}
