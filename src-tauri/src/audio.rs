//! Phát nhạc bằng Rust, không nhờ WebView.
//!
//! ── VÌ SAO KHÔNG DÙNG THẺ `<audio>` CỦA WEBVIEW2 ─────────────────────────────
//! WebView2 bị Windows gỡ tài nguyên khi cửa sổ thu nhỏ (nhạc rè rồi đứt). Đưa cả
//! đường phát xuống Rust thì cửa sổ chỉ còn là UI: thu nhỏ, khoá máy, tắt màn hình —
//! `rodio` vẫn đẩy byte vào card âm thanh.
//!
//! ── PHẢI CÓ HEADER `RANGE` ───────────────────────────────────────────────────
//! googlevideo trả `200` cho request không có `Range`, nhưng bóp còn ~32 KiB/s (đo
//! 2026-08-15: 4,5 MB mất 141 giây). Cùng URL, cùng lúc, `Range: bytes=0-` trả `206` ở
//! ~31 MiB/s. Không có biên 1 MiB nào và không có `403` — chỉ cần **có** header đó.
//! Vì vậy `HttpSource` mở đúng MỘT request khoảng mở rồi rót vào đệm.

use parking_lot::{Condvar, Mutex};
use std::io::{Read, Result as IoResult, Seek, SeekFrom};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Đọc mỗi nhịp bao nhiêu byte từ mạng. 64 KiB đủ nhỏ để bài bắt đầu phát gần như ngay,
/// đủ lớn để không khoá `Mutex` liên tục.
const READ_STEP: usize = 64 * 1024;

/// Những gì server khai khi mở request: dài bao nhiêu, khuôn gì.
#[derive(Debug, Clone, Default)]
pub struct Meta {
    /// Tổng số byte của FILE (không phải của lô), `0` nếu server không khai.
    pub len: u64,
    pub mime: Option<String>,
}

/// Đệm của một request đang chạy. Thread mạng ghi, thread giải mã đọc.
struct Buffer {
    data: Mutex<Vec<u8>>,
    /// Đã đọc hết body (hoặc lỗi) — người đọc không được chờ thêm nữa.
    done: AtomicBool,
    /// Không ai cần đệm này nữa (đổi bài, hoặc tua ra ngoài vùng đã tải). Thread mạng
    /// nhìn cờ này mỗi lô: bỏ đi mà cứ tải tiếp là mỗi lần bấm next lại thêm một luồng
    /// ngốn băng thông tới hết bài.
    cancelled: AtomicBool,
    /// Lỗi mạng, để `Read` trả `ErrorKind::Other` thay vì treo.
    failed: Mutex<Option<String>>,
    /// Header của response, có ngay khi server trả lời — trước cả byte đầu tiên.
    meta: Mutex<Option<Meta>>,
    ready: Condvar,
}

impl Buffer {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            data: Mutex::new(Vec::new()),
            done: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
            failed: Mutex::new(None),
            meta: Mutex::new(None),
            ready: Condvar::new(),
        })
    }

    fn finish(&self, error: Option<String>) {
        if let Some(message) = error {
            *self.failed.lock() = Some(message);
        }
        self.done.store(true, Ordering::Release);
        self.ready.notify_all();
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.finish(None);
    }
}

/// Nguồn byte HTTP có `Seek`, dùng cho `rodio::Decoder`.
///
/// `rodio` bọc cái này thành `MediaSource` của symphonia, và symphonia đọc kiểu nhảy
/// qua nhảy lại (moov ở cuối file, index, rồi mới tới audio). Nên `Seek` phải rẻ trong
/// vùng đã tải — đó là lý do giữ nguyên cả đệm chứ không xả dần.
pub struct HttpSource {
    url: String,
    headers: Vec<(String, String)>,
    /// Tổng số byte của file, lấy từ `content-range` của chính response. `0` = không khai.
    len: u64,
    /// Vị trí con trỏ đọc, tính từ đầu FILE.
    pos: u64,
    /// Byte đầu tiên mà request hiện tại xin — đệm tương ứng với `[start, start + data.len())`.
    start: u64,
    buffer: Arc<Buffer>,
}

impl HttpSource {
    pub fn new(url: String, headers: Vec<(String, String)>) -> Self {
        let mut source = Self {
            url,
            headers,
            len: 0,
            pos: 0,
            start: 0,
            buffer: Buffer::new(),
        };
        source.spawn_from(0);
        source
    }

    /// Chờ header của response đầu tiên rồi trả đúng những gì server khai.
    ///
    /// Gọi trước khi dựng decoder: `rodio` cần `byte_len` để tua, và symphonia dò khuôn
    /// nhanh hơn nhiều khi có `content-type`. Cả hai chỉ server biết — JS đoán hộ là đoán
    /// sai (bài thư viện có thể là FLAC, MP3, M4A tuỳ file người dùng tải lên).
    pub fn wait_meta(&mut self) -> Result<Meta, String> {
        let mut meta = self.buffer.meta.lock();
        while meta.is_none() && !self.buffer.done.load(Ordering::Acquire) {
            self.buffer
                .ready
                .wait_for(&mut meta, Duration::from_millis(250));
        }
        if let Some(found) = meta.clone() {
            self.len = found.len;
            return Ok(found);
        }
        drop(meta);
        Err(self
            .buffer
            .failed
            .lock()
            .clone()
            .unwrap_or_else(|| "không mở được luồng byte".to_string()))
    }

    /// Mở luồng byte mới bắt đầu từ `offset`, bỏ luồng cũ.
    ///
    /// Một luồng có thể cần NHIỀU request: `/api/stream/<id>` của app cố tình cắt lô (6
    /// MiB lô đầu, 2 MiB các lô sau) để không giữ một response sống suốt bài — Vercel tính
    /// tiền theo thời gian và `maxDuration` là 300 s. Vì vậy hết body chưa chắc là hết
    /// file: còn thiếu byte thì xin tiếp từ chỗ dừng. googlevideo thì trả cả file trong
    /// một response nên vòng lặp chạy đúng một lần.
    fn spawn_from(&mut self, offset: u64) {
        // Đệm cũ có thể còn một thread đang tải: cắt trước khi thay.
        self.buffer.cancel();
        let buffer = Buffer::new();
        self.buffer = Arc::clone(&buffer);
        self.start = offset;

        let url = self.url.clone();
        let headers = self.headers.clone();

        std::thread::spawn(move || {
            let mut next = offset;
            loop {
                let mut request = ureq::get(&url);
                for (name, value) in &headers {
                    request = request.header(name.as_str(), value.as_str());
                }
                // Header duy nhất bắt buộc: thiếu nó googlevideo bóp còn ~32 KiB/s.
                request = request.header("range", &format!("bytes={next}-"));

                let response = match request.call() {
                    Ok(response) => response,
                    Err(error) => {
                        buffer.finish(Some(error.to_string()));
                        return;
                    }
                };

                // Meta chỉ lấy ở lô đầu: các lô sau khai cùng `content-range` tổng, nhưng
                // người đọc đã có thứ nó cần và không được thấy giá trị nhảy qua nhảy lại.
                let mut meta = buffer.meta.lock();
                if meta.is_none() {
                    *meta = Some(Meta {
                        len: total_from_headers(&response, next),
                        mime: response
                            .headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .map(str::to_string),
                    });
                }
                let total = meta.as_ref().map(|m| m.len).unwrap_or(0);
                drop(meta);
                buffer.ready.notify_all();

                let mut body = response.into_body().into_reader();
                let mut chunk = vec![0u8; READ_STEP];
                let mut read_here = 0u64;
                loop {
                    if buffer.cancelled.load(Ordering::Acquire) {
                        return;
                    }
                    match body.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(n) => {
                            buffer.data.lock().extend_from_slice(&chunk[..n]);
                            read_here += n as u64;
                            buffer.ready.notify_all();
                        }
                        Err(error) => {
                            buffer.finish(Some(error.to_string()));
                            return;
                        }
                    }
                }

                next += read_here;
                // Hết file, hoặc server không khai độ dài, hoặc lô rỗng (xin tiếp là lặp
                // vô hạn) — dừng ở đây.
                if read_here == 0 || total == 0 || next >= total {
                    buffer.finish(None);
                    return;
                }
            }
        });
    }
}

/// Tổng số byte của FILE theo header của response.
///
/// `206` trả `content-range: bytes <đầu>-<cuối>/<tổng>` — con số sau dấu `/` là thứ cần.
/// `200` (server không hiểu `Range`) thì `content-length` chính là cả file, cộng thêm
/// `offset` vì lô này bắt đầu từ đó. Không khai gì thì trả `0`: người gọi coi như không
/// biết độ dài, vẫn phát được, chỉ mất tua-từ-cuối.
fn total_from_headers(response: &ureq::http::Response<ureq::Body>, offset: u64) -> u64 {
    let headers = response.headers();
    if let Some(range) = headers.get("content-range").and_then(|v| v.to_str().ok()) {
        if let Some(total) = range.rsplit('/').next() {
            if let Ok(parsed) = total.trim().parse::<u64>() {
                return parsed;
            }
        }
    }
    headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|len| len + offset)
        .unwrap_or(0)
}

impl Read for HttpSource {
    fn read(&mut self, out: &mut [u8]) -> IoResult<usize> {
        if self.len > 0 && self.pos >= self.len {
            return Ok(0);
        }

        let offset_in_buffer = self.pos.saturating_sub(self.start) as usize;
        let mut data = self.buffer.data.lock();

        // Chờ tới khi có byte ở vị trí cần, hoặc request kết thúc.
        while data.len() <= offset_in_buffer && !self.buffer.done.load(Ordering::Acquire) {
            // `wait_for` nhả lock trong lúc chờ; hết 250 ms thì vòng lại để nhìn `done` —
            // không có nó, một request đứt giữa đường sẽ treo thread giải mã mãi mãi.
            self.buffer
                .ready
                .wait_for(&mut data, Duration::from_millis(250));
        }

        if let Some(message) = self.buffer.failed.lock().clone() {
            if data.len() <= offset_in_buffer {
                return Err(std::io::Error::other(message));
            }
        }

        if data.len() <= offset_in_buffer {
            return Ok(0);
        }

        let n = (data.len() - offset_in_buffer).min(out.len());
        out[..n].copy_from_slice(&data[offset_in_buffer..offset_in_buffer + n]);
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for HttpSource {
    fn seek(&mut self, from: SeekFrom) -> IoResult<u64> {
        let target = match from {
            SeekFrom::Start(n) => n,
            SeekFrom::Current(delta) => self.pos.saturating_add_signed(delta),
            SeekFrom::End(delta) => {
                if self.len == 0 {
                    return Err(std::io::Error::other(
                        "không biết độ dài file nên không tua từ cuối được",
                    ));
                }
                self.len.saturating_add_signed(delta)
            }
        };

        // Trong vùng đã tải (hoặc đang tải tới) thì chỉ đổi con trỏ — không request lại.
        // Đây là đường symphonia đi liên tục khi đọc moov/index, nên nó phải miễn phí.
        let downloaded = self.buffer.data.lock().len() as u64;
        let in_flight = !self.buffer.done.load(Ordering::Acquire);
        let known_end = self.start + downloaded;
        if target >= self.start && (target <= known_end || in_flight) {
            self.pos = target;
            return Ok(target);
        }

        self.spawn_from(target);
        self.pos = target;
        Ok(target)
    }
}

impl Drop for HttpSource {
    fn drop(&mut self) {
        // Bài bị bỏ (đổi bài, tắt app) — `rodio` thả decoder, decoder thả cái này. Cắt
        // luôn thread mạng, đừng để nó tải nốt một bài chẳng ai nghe.
        self.buffer.cancel();
    }
}
