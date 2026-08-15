//! Thanh điều khiển media của Windows (SMTC).
//!
//! Đây là thứ hiện lên khi bấm nút media trên bàn phím, và là bảng nhỏ ở góc màn hình
//! khoá. Không có nó thì "phát nền" vẫn chạy nhưng người dùng không điều khiển được khi
//! app bị che — mà đó chính là lý do làm vỏ Windows.
//!
//! `souvlaki` cần một HWND trên Windows; lấy từ cửa sổ Tauri qua `raw_window_handle`.

use parking_lot::Mutex;
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
    PlatformConfig,
};
use std::sync::Arc;
use std::time::Duration;

/// Lệnh người dùng bấm trên SMTC, chuyển thành event cho JS xử lý.
#[derive(Debug, Clone, Copy)]
pub enum Command {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    Seek(f64),
}

pub struct Smtc {
    controls: Mutex<MediaControls>,
}

impl Smtc {
    /// `hwnd` là handle cửa sổ chính. `on_command` chạy trên thread của Windows nên phải
    /// nhẹ — chỉ đẩy event sang JS, không chặn.
    pub fn new<F>(hwnd: *mut std::ffi::c_void, on_command: F) -> Result<Arc<Self>, String>
    where
        F: Fn(Command) + Send + 'static,
    {
        let config = PlatformConfig {
            dbus_name: "vong",
            display_name: "Vọng",
            hwnd: Some(hwnd),
        };
        let mut controls =
            MediaControls::new(config).map_err(|e| format!("Không mở được SMTC: {e:?}"))?;

        controls
            .attach(move |event| {
                let command = match event {
                    MediaControlEvent::Play => Some(Command::Play),
                    MediaControlEvent::Pause => Some(Command::Pause),
                    MediaControlEvent::Toggle => Some(Command::Toggle),
                    MediaControlEvent::Next => Some(Command::Next),
                    MediaControlEvent::Previous => Some(Command::Previous),
                    MediaControlEvent::SetPosition(MediaPosition(duration)) => {
                        Some(Command::Seek(duration.as_secs_f64()))
                    }
                    // `Stop`, `Raise`, `Quit`, `Seek(delta)`, `OpenUri`: Windows không gửi
                    // hoặc app không có nghĩa gì để làm — bỏ qua thay vì đoán.
                    _ => None,
                };
                if let Some(command) = command {
                    on_command(command);
                }
            })
            .map_err(|e| format!("Không gắn được SMTC: {e:?}"))?;

        Ok(Arc::new(Self {
            controls: Mutex::new(controls),
        }))
    }

    pub fn set_metadata(
        &self,
        title: &str,
        artist: &str,
        album: &str,
        artwork_url: Option<&str>,
        duration_sec: f64,
    ) {
        let _ = self.controls.lock().set_metadata(MediaMetadata {
            title: Some(title),
            artist: Some(artist),
            album: Some(album),
            cover_url: artwork_url,
            duration: if duration_sec > 0.0 {
                Some(Duration::from_secs_f64(duration_sec))
            } else {
                None
            },
        });
    }

    pub fn set_playback(&self, playing: bool, pos_sec: f64) {
        let progress = Some(MediaPosition(Duration::from_secs_f64(pos_sec.max(0.0))));
        let playback = if playing {
            MediaPlayback::Playing { progress }
        } else {
            MediaPlayback::Paused { progress }
        };
        let _ = self.controls.lock().set_playback(playback);
    }
}

// `MediaControls` trên Windows giữ con trỏ COM không `Send`, nhưng mọi lời gọi của mình
// đều đi qua `Mutex` và app chỉ có một cửa sổ duy nhất sống suốt phiên, nên chia sẻ giữa
// các thread của Tauri là an toàn.
unsafe impl Send for Smtc {}
unsafe impl Sync for Smtc {}
