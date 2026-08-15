//! Vỏ Windows của Vọng.
//!
//! Cửa sổ nạp thẳng trang web đang chạy (`https://streammusic.vercel.app`) — không nhúng
//! asset, không build lại UI cho desktop. Việc duy nhất Rust làm thêm so với một browser
//! là **phát nhạc**: byte đi qua `audio.rs`/`player.rs` chứ không qua thẻ `<audio>` của
//! WebView2, nên thu nhỏ cửa sổ hay khoá máy nhạc vẫn chạy.

mod audio;
mod player;
mod smtc;

use player::{Engine, TrackRequest};
use smtc::{Command, Smtc};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// Nhịp bắn trạng thái về JS. 400 ms giống nhịp poll của YouTube IFrame cũ: scrubber chạy
/// mượt mà không làm WebView bận.
const TICK_MS: u64 = 400;

struct AppState {
    player: Arc<Engine>,
    smtc: Arc<Smtc>,
}

#[tauri::command]
fn play_track(state: State<'_, AppState>, track: TrackRequest) -> Result<(), String> {
    let meta = track.clone();
    state.player.play_track(track)?;
    state.smtc.set_metadata(
        &meta.title,
        &meta.artist,
        &meta.album,
        meta.artwork_url.as_deref(),
        meta.duration_sec,
    );
    state.smtc.set_playback(true, meta.start_sec);
    Ok(())
}

#[tauri::command]
fn pause(state: State<'_, AppState>) {
    state.player.pause();
    let now = state.player.state();
    state.smtc.set_playback(false, now.pos_ms as f64 / 1000.0);
}

#[tauri::command]
fn resume(state: State<'_, AppState>) {
    state.player.resume();
    let now = state.player.state();
    state.smtc.set_playback(true, now.pos_ms as f64 / 1000.0);
}

#[tauri::command]
fn seek(state: State<'_, AppState>, pos: f64) -> Result<(), String> {
    state.player.seek(pos)?;
    let playing = state.player.state().playing;
    state.smtc.set_playback(playing, pos);
    Ok(())
}

#[tauri::command]
fn set_volume(state: State<'_, AppState>, volume: f32) {
    state.player.set_volume(volume);
}

/// Thread bắn `player://tick` và `player://ended`.
///
/// `ended` phải đi từ Rust: JS không thấy được sink cạn byte. Store bên JS nghe event này
/// rồi tự sang bài kế — hàng đợi vẫn do JS giữ.
fn spawn_tick(app: AppHandle, player: Arc<Engine>, smtc: Arc<Smtc>) {
    std::thread::spawn(move || {
        let mut last_playing = false;
        let mut last_push = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(TICK_MS));
            let state = player.state();

            let _ = app.emit("player://tick", &state);
            if state.ended {
                let _ = app.emit("player://ended", ());
            }

            // Windows KHÔNG tự chạy con trỏ thời gian của SMTC: khai một lần rồi im là
            // thanh media đứng mãi ở giây đó. Nên đẩy lại theo nhịp — nhưng thưa hơn tick
            // (mỗi giây, thay vì 400 ms) vì mỗi lần là một lượt gọi WinRT, mà bảng của
            // Windows cũng chỉ hiện tới giây.
            let changed_playing = state.playing != last_playing;
            if changed_playing || last_push.elapsed() >= Duration::from_secs(1) {
                smtc.set_playback(state.playing, state.pos_ms as f64 / 1000.0);
                last_playing = state.playing;
                last_push = Instant::now();
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Thứ tự đăng ký có nghĩa: trên Windows, URL của deep link tới instance MỚI dưới
        // dạng CLI arg, và `single-instance` là bên chuyển nó cho `deep-link`
        // (`single-instance/src/lib.rs` gọi `deep_link.handle_cli_arguments`). Đăng ký
        // ngược thứ tự là mất luôn link đăng nhập.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            play_track,
            pause,
            resume,
            seek,
            set_volume
        ])
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("cửa sổ main phải có trong tauri.conf.json");

            let player = Engine::new()?;

            // SMTC cần HWND thật, không phải handle của WebView.
            let hwnd = window.hwnd()?.0;
            let handle = app.handle().clone();
            let smtc = Smtc::new(hwnd, move |command| {
                let state: State<'_, AppState> = handle.state();
                match command {
                    Command::Play => {
                        state.player.resume();
                        let _ = handle.emit("player://playing", true);
                    }
                    Command::Pause => {
                        state.player.pause();
                        let _ = handle.emit("player://playing", false);
                    }
                    Command::Toggle => {
                        let playing = state.player.state().playing;
                        if playing {
                            state.player.pause();
                        } else {
                            state.player.resume();
                        }
                        let _ = handle.emit("player://playing", !playing);
                    }
                    // Đổi bài là việc của hàng đợi bên JS, Rust không biết bài kế là gì.
                    Command::Next => {
                        let _ = handle.emit("player://next", ());
                    }
                    Command::Previous => {
                        let _ = handle.emit("player://previous", ());
                    }
                    Command::Seek(pos) => {
                        let _ = state.player.seek(pos);
                        let _ = handle.emit("player://seeked", pos);
                    }
                }
            })?;

            app.manage(AppState {
                player: Arc::clone(&player),
                smtc: Arc::clone(&smtc),
            });

            spawn_tick(app.handle().clone(), player, smtc);

            setup_deep_link(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("không chạy được app Tauri");
}

/// Đăng nhập: browser hệ thống trả về `vong://auth?code=…`, đổi mã đó lấy cookie phiên
/// ngay trong WebView bằng `/api/native/adopt`.
fn setup_deep_link(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_deep_link::DeepLinkExt;

    // Bản NSIS/MSI tự ghi registry, nhưng bản chạy từ `cargo`/`tauri dev` thì không —
    // `register_all` để lúc phát triển vẫn bấm được link.
    let _ = app.deep_link().register_all();

    let handle = app.handle().clone();
    let adopt = move |urls: Vec<tauri::Url>| {
        let Some(code) = urls.iter().find_map(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "code")
                .map(|(_, value)| value.into_owned())
        }) else {
            return;
        };
        if let Some(window) = handle.get_webview_window("main") {
            // Origin lấy từ chính trang đang mở, không phải hằng số: bản dev chạy trên
            // `localhost:3000`, đóng cứng URL production là đổi mã ở sai máy chủ (mã
            // dùng một lần, nên lần thử sau hết mã mà vẫn chưa đăng nhập được).
            let Ok(mut target) = window.url() else { return };
            target.set_path("/api/native/adopt");
            target.set_query(Some(&format!("code={code}")));
            let _ = window.navigate(target);
        }
    };

    // Link mở app từ trạng thái tắt: URL đã nằm sẵn trong `get_current()`.
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        adopt(urls);
    }
    app.deep_link().on_open_url(move |event| {
        adopt(event.urls());
    });
    Ok(())
}


