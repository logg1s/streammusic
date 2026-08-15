//! Trạng thái phát: một sink `rodio`, một bài, và mốc thời gian cho UI.
//!
//! Hàng đợi nằm ở JS (store `zustand` dùng chung với web) — Rust chỉ biết bài đang phát.
//! Lý do: hàng đợi là chuyện UI (xáo, lặp, radio nạp thêm), còn Rust chỉ cần đúng một
//! việc là đẩy byte ra loa. Đổi bài = một lệnh `play_track` mới.

use parking_lot::Mutex;
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Player as Sink};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

use crate::audio::HttpSource;

/// Bài mà JS yêu cầu phát. `camelCase` để khớp thẳng payload của `invoke`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRequest {
    pub url: String,
    /// Header gửi kèm khi tải byte: `Authorization: Bearer` cho bài thư viện.
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    /// Khuôn và độ dài KHÔNG nằm ở đây: `HttpSource` đọc thẳng từ header của response
    /// (`content-range`, `content-type`) — server là bên duy nhất biết chắc.
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub artwork_url: Option<String>,
    /// Thời lượng bài (giây) theo metadata — dùng cho SMTC và scrubber trước khi
    /// symphonia đọc xong moov.
    #[serde(default)]
    pub duration_sec: f64,
    /// Bắt đầu phát từ giây này (khôi phục chỗ đang nghe).
    #[serde(default)]
    pub start_sec: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub pos_ms: u64,
    pub dur_ms: u64,
    pub playing: bool,
    /// Bài đã chạy hết — JS nghe event này để sang bài kế.
    pub ended: bool,
}

struct Current {
    sink: Sink,
    dur_ms: u64,
    /// `ended` chỉ được bắn một lần cho mỗi bài, nếu không JS sẽ nhảy bài liên tục.
    ended_sent: bool,
}

pub struct Engine {
    /// Giữ thiết bị âm thanh sống: rơi ra khỏi scope là mất tiếng.
    device: MixerDeviceSink,
    current: Mutex<Option<Current>>,
    volume: Mutex<f32>,
}

impl Engine {
    pub fn new() -> Result<Arc<Self>, String> {
        let device = DeviceSinkBuilder::open_default_sink()
            .map_err(|e| format!("Không mở được thiết bị âm thanh: {e}"))?;
        Ok(Arc::new(Self {
            device,
            current: Mutex::new(None),
            volume: Mutex::new(1.0),
        }))
    }

    /// Nạp và phát một bài mới. Bài đang phát bị bỏ ngay (sink cũ `stop()`).
    pub fn play_track(&self, request: TrackRequest) -> Result<(), String> {
        let mut source = HttpSource::new(request.url.clone(), request.headers.clone());
        // Chờ header trước khi dựng decoder: độ dài và khuôn là của server, không phải
        // của JS đoán hộ.
        let meta = source.wait_meta()?;

        let mut builder = rodio::Decoder::builder()
            .with_data(source)
            .with_seekable(true);
        if meta.len > 0 {
            builder = builder.with_byte_len(meta.len);
        }
        // Gợi ý khuôn: URL googlevideo không có phần mở rộng, thiếu hint thì symphonia
        // phải dò từng khuôn một.
        if let Some(mime) = meta.mime.as_deref() {
            builder = builder.with_mime_type(mime);
            if mime.starts_with("audio/mp4") || mime.starts_with("video/mp4") {
                builder = builder.with_hint("m4a");
            }
        }
        let decoder = builder
            .build()
            .map_err(|e| format!("Không giải được bài này: {e}"))?;

        let sink = Sink::connect_new(self.device.mixer());
        sink.set_volume(*self.volume.lock());
        sink.append(decoder);

        if request.start_sec > 0.5 {
            // Lỗi tua lúc mới nạp không phải lý do để không phát: cứ chạy từ đầu.
            let _ = sink.try_seek(Duration::from_secs_f64(request.start_sec));
        }

        let dur_ms = (request.duration_sec * 1000.0) as u64;
        let mut guard = self.current.lock();
        if let Some(previous) = guard.take() {
            previous.sink.stop();
        }
        *guard = Some(Current {
            sink,
            dur_ms,
            ended_sent: false,
        });
        Ok(())
    }

    pub fn pause(&self) {
        if let Some(current) = self.current.lock().as_ref() {
            current.sink.pause();
        }
    }

    pub fn resume(&self) {
        if let Some(current) = self.current.lock().as_ref() {
            current.sink.play();
        }
    }

    pub fn seek(&self, pos_sec: f64) -> Result<(), String> {
        let guard = self.current.lock();
        let Some(current) = guard.as_ref() else {
            return Ok(());
        };
        current
            .sink
            .try_seek(Duration::from_secs_f64(pos_sec.max(0.0)))
            .map_err(|e| format!("Không tua được: {e}"))
    }

    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.0);
        *self.volume.lock() = clamped;
        if let Some(current) = self.current.lock().as_ref() {
            current.sink.set_volume(clamped);
        }
    }

    /// Trạng thái hiện tại. `ended` chỉ `true` **một lần** cho mỗi bài — đọc là tiêu.
    pub fn state(&self) -> PlayerState {
        let mut guard = self.current.lock();
        let Some(current) = guard.as_mut() else {
            return PlayerState {
                pos_ms: 0,
                dur_ms: 0,
                playing: false,
                ended: false,
            };
        };

        // `get_pos()` là vị trí tuyệt đối trong bài, đã tính cả `try_seek` — không cần
        // cộng thêm mốc bắt đầu.
        let pos_ms = current.sink.get_pos().as_millis() as u64;
        let empty = current.sink.empty();
        let ended = empty && !current.ended_sent;
        if ended {
            current.ended_sent = true;
        }

        PlayerState {
            pos_ms,
            dur_ms: current.dur_ms,
            playing: !current.sink.is_paused() && !empty,
            ended,
        }
    }
}
