# Vọng

Nghe nhạc từ kho lưu trữ đám mây của chính bạn — Google Drive, Dropbox, OneDrive.
File không rời khỏi kho: ứng dụng chỉ đọc tag để dựng thư viện, rồi phát trực tiếp
bằng HTTP range request.

---

## Cách hoạt động

```
Trình duyệt                  Ứng dụng (Vercel)              Kho lưu trữ
    │                              │                              │
    │  GET /api/stream/{trackId}   │                              │
    ├─────────────────────────────►│                              │
    │       + header Range         │  kiểm tra track thuộc user   │
    │                              │  lấy access token (tự refresh)│
    │                              │                              │
    │                              │  Dropbox / OneDrive:         │
    │                              ├──── xin link tạm thời ──────►│
    │  ◄── 302 tới link đó ────────┤                              │
    │  ─────────── tải thẳng, không qua server mình ─────────────►│
    │                              │                              │
    │                              │  Google Drive:               │
    │                              ├─ GET ?alt=media + Bearer ───►│
    │  ◄── 206 Partial Content ────┤◄──── stream byte ────────────┤
```

**Google Drive bắt buộc phải proxy** vì API của họ chỉ nhận header `Authorization`,
không có link tạm thời tự xác thực. Dropbox và OneDrive đều cấp link ngắn hạn nên
chỉ cần trả 302 — byte không đi qua máy chủ, không tốn băng thông.

## Kiến trúc

Mọi khác biệt giữa ba nhà cung cấp nằm gọn trong một interface duy nhất
(`src/lib/providers/types.ts`). Scanner, endpoint stream và toàn bộ UI chỉ nói
chuyện với interface đó — thêm S3 hay WebDAV sau này chỉ là viết thêm một file.

```
src/
  lib/providers/     types.ts · dropbox.ts · google-drive.ts · onedrive.ts
  lib/metadata.ts    đọc tag ID3 qua range request (chỉ tải 2–25% file)
  lib/scanner.ts     quét theo lô, ghi vào thư viện
  lib/connections.ts lưu + tự refresh OAuth token (mã hoá AES-256-GCM)
  app/api/stream/    endpoint phát nhạc: 302 hoặc proxy Range
  components/player/ audio engine + thanh phát (sống ở layout, không ở page)
```

Thẻ `<audio>` nằm trong `src/app/(app)/layout.tsx`. App Router giữ nguyên layout
khi điều hướng nên nhạc chạy liên tục lúc chuyển trang — nếu đặt trong page thì
mỗi lần đổi trang là đứt nhạc.

---

## Cài đặt

### 1. Database

```bash
npm i -g vercel
vercel link
vercel integration add neon --yes --no-claim
vercel env pull .env.local --yes
```

Hoặc tự tạo Postgres ở đâu đó rồi điền `DATABASE_URL` vào `.env.local`.

```bash
npm run db:push     # tạo bảng
npm run db:index    # pg_trgm + index cho tìm kiếm
```

### 2. Ảnh bìa album (tuỳ chọn)

Tạo một Blob store trong dashboard Vercel → Storage, rồi điền
`BLOB_READ_WRITE_TOKEN`. Không có nó thì app vẫn chạy, chỉ là album không có bìa.

### 3. OAuth

`.env.local` đã có sẵn `ENCRYPTION_KEY` và `AUTH_SECRET` được sinh ngẫu nhiên.
Còn lại phải đăng ký ở ba cổng developer:

| Nhà cung cấp            | Nơi đăng ký                                                                | Redirect URI cần thêm                                               |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Google (đăng nhập)      | [console.cloud.google.com](https://console.cloud.google.com) → Credentials | `http://localhost:3000/api/auth/callback/google`                    |
| Google Drive            | cùng OAuth client ở trên                                                   | `http://localhost:3000/api/connections/oauth/google_drive/callback` |
| Dropbox                 | [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)     | `http://localhost:3000/api/connections/oauth/dropbox/callback`      |
| OneDrive                | [portal.azure.com](https://portal.azure.com) → App registrations           | `http://localhost:3000/api/connections/oauth/onedrive/callback`     |
| YouTube (radio theo gu) | cùng OAuth client Google                                                   | `http://localhost:3000/api/youtube/oauth/callback`                  |

Quyền cần bật cho Dropbox: `account_info.read`, `files.metadata.read`,
`files.content.read`.

Đăng nhập dùng Google, nên **`AUTH_GOOGLE_ID` và `AUTH_GOOGLE_SECRET` là bắt buộc**.
Dropbox và OneDrive thì tuỳ chọn — provider nào chưa điền khoá sẽ tự ẩn khỏi giao diện.

### 4. Chạy

```bash
npm run dev
```

---

## ⚠️ Google Drive: đọc trước khi dùng

Để quét thư viện nhạc có sẵn, bắt buộc dùng scope `drive.readonly`. Google xếp nó
vào nhóm **restricted scope**, kéo theo hai hệ quả thật:

- **App ở trạng thái Testing** (mặc định): không cần verify, tối đa 100 test user —
  nhưng **refresh token hết hạn sau 7 ngày**. Người dùng phải bấm "Cấp quyền lại"
  mỗi tuần. Ứng dụng xử lý việc này đàng hoàng: kết nối chuyển sang trạng thái
  `needs_reauth` và hiện nút cấp quyền lại, không sập.
- **Muốn Published**: Google yêu cầu app verification kèm CASA security assessment
  — tốn tiền và mất vài tuần.
- **Có Google Workspace**: đặt consent screen là _Internal_ thì tránh được cả hai.

`drive.file` không thay thế được vì scope đó chỉ thấy file do chính app tạo ra.

**Dropbox và OneDrive không có ràng buộc này.** Nếu chỉ muốn thử cho nhanh, nối
Dropbox trước.

---

## YouTube

YouTube là nguồn nhạc chính thức của app, ngang hàng với kho lưu trữ:

- **Tìm bất cứ bài nào**: trang _Tìm kiếm_ có mục "Trên YouTube" bên dưới kết quả
  thư viện. Mỗi dòng phát được ngay, chèn được vào hàng đợi, thêm được vào playlist.
- **Radio tự dài ra**: bấm **Radio** ở một bài (thư viện hay YouTube) để nối tiếp
  bài tương tự. Nguồn ứng viên là **automix của YouTube Music** — thứ YouTube tự
  nối sau một bài — rồi xếp lại theo gu và lịch sử nghe trong app.
- **Playlist thủ công**: sửa thứ tự bằng ▲▼, đổi tên ngay ở tiêu đề, trộn bài thư
  viện với bài YouTube trong cùng một danh sách.
- **Trang chủ**: "Nghe gần đây" (từ `play_events` của app) và các hàng gợi ý YouTube
  Music trả về.

### Nguồn audio

Bài YouTube **không** phát bằng iframe nữa. Server lấy URL audio thật qua
[`youtubei.js`](https://github.com/LuanRT/YouTube.js) (client `VISIONOS`, ngã dự
phòng `ANDROID_VR`), rồi `/api/youtube/audio/<videoId>` chuẩn hoá byte-range để thẻ
`<audio>` của chính app đọc. Nhờ vậy mới **phát nền được trên điện thoại** (xem mục
dưới) — media trong iframe cross-origin thì không điều khiển được.

Ba điều phải biết:

- Đây là **API nội bộ của YouTube**, không phải API công khai: nó có thể vỡ bất cứ
  lúc nào. Đo được 2026-08: `ANDROID_VR` đã bị siết, URL của nó chỉ phục vụ 1 MiB
  đầu rồi trả `403`; `VISIONOS` vẫn phục vụ hết bài. Thứ tự client nằm ở
  `CLIENTS` trong `src/lib/youtube/resolve.ts` — client nào hỏng thì đổi chỗ.
  Hỏng hết thì player tự lùi về iframe (`YoutubeFallbackGate`), vẫn nghe được nhưng
  mất phát nền.
- googlevideo trả `403` cho range mở (`bytes=0-`) và cho range phủ đúng cả file, nên
  proxy luôn hỏi từng lô ≤ 1 MiB rồi nối lại. Đừng "tối ưu" bằng cách hỏi cả file.
- **Byte không được đi qua Vercel**: AUP cấm proxy/host media, và Vercel tính tiền
  hai lần. Deploy thì đặt `YT_AUDIO_ORIGIN` trỏ sang VPS tự host (một droplet
  $4/tháng, 500 GiB egress ≈ 10.000 giờ nghe audio-only).

### Phát nền trên điện thoại

- **Android (Chrome)**: chạy được ngay, kể cả khi khoá máy — Chromium chỉ tạm dừng
  media ẩn khi media đó **có video**, còn đây là audio thuần.
- **iOS (Safari)**: phải **Thêm vào Màn hình chính** rồi mở từ icon đó. Web app
  standalone mới được phát nền (từ iOS 15.4); mở trong tab Safari thì khoá máy là
  nhạc dừng.

Điều khiển trên màn hình khoá / tai nghe dùng Media Session API, có cả thanh tua.

### Tài khoản & khoá API

Cả hai đều **tuỳ chọn** — không có gì thì tìm kiếm, radio, gợi ý vẫn chạy (InnerTube
không cần credential và không tốn quota):

1. **Nối tài khoản YouTube** ở _Cài đặt → Kho lưu trữ → Gu nhạc YouTube_: thêm phần
   cá nhân hoá theo video đã Thích và kênh đã Đăng ký. Dùng lại
   `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, cần redirect URI
   `http://localhost:3000/api/youtube/oauth/callback` và scope
   `https://www.googleapis.com/auth/youtube.readonly` (**sensitive**; refresh token
   ở chế độ Testing sống 7 ngày, hết thì UI hiện "Cấp quyền lại").
2. **`YOUTUBE_API_KEY`**: giờ chỉ còn cho mục "Đang thịnh hành"
   (`videos.list?chart=mostPopular`, **1 unit**/lần, cache 6 giờ) và nhánh dò
   playlist dự phòng khi automix quá mỏng. Không có key thì mục đó tự ẩn.
3. **`YT_MUSIC_COOKIE`** (tuỳ chọn): cá nhân hoá hàng gợi ý trang chủ. Dùng **tài
   khoản phụ** — export cookie từ cửa sổ ẩn danh rồi đóng vĩnh viễn cửa sổ đó, và
   biết rằng YouTube có thể khoá tài khoản dùng theo cách này. Đường phát nhạc
   **không bao giờ** nhận cookie này (gắn cookie sẽ đẩy resolve sang `web`, kéo theo
   DRM/SABR/PO token).

**Quota**: `search.list` của Data API còn 100 lần/ngày mỗi project, nhưng app gần như
không dùng nữa — tìm kiếm và automix đi qua InnerTube. Một lần đồng bộ gu nhạc ≈ 20
unit. Quota tính cho project của credential thực gửi đi.

---

## Chi phí băng thông

| Nguồn             | Byte đi qua Vercel                               |
| ----------------- | ------------------------------------------------ |
| Dropbox, OneDrive | ~0 (302 redirect)                                |
| Google Drive      | toàn bộ — khoảng 60–100 MB cho mỗi giờ nghe      |
| YouTube           | ~50 MB/giờ — **phải** dời sang `YT_AUDIO_ORIGIN` |

Nếu Drive trở nên tốn kém, bước nâng cấp tiếp theo là cache những bài nghe nhiều
sang Vercel Blob rồi phục vụ qua CDN. Nhánh YouTube thì không có lựa chọn: AUP của
Vercel cấm proxy media, nên byte audio phải nằm trên VPS riêng.

---

## Lệnh

```bash
npm run dev         # máy chủ phát triển
npm run build       # build production
npm run typecheck   # tsc --noEmit
npm run db:push     # đồng bộ schema vào Postgres
npm run db:studio   # xem dữ liệu bằng Drizzle Studio
npm run db:index    # tạo extension + index tìm kiếm (chạy một lần sau db:push)
npm run verify      # kiểm chứng mã hoá token + đọc tag qua range request
npm run seed:demo   # nạp 8 bài nhạc công khai để thử thư viện + player khi chưa có OAuth
```

`npm run verify` không cần database hay OAuth. Nó tải tag của vài file nhạc công
khai và in ra số byte thực sự tải về — dùng để xác nhận rằng việc quét không kéo
cả file về. Kết quả đo thực tế: **2% với file MP3, 25% với file M4A, 5 request/bài**.

`npm run seed:demo` cần database. Nó tạo một user demo, đọc tag thật từ vài file
nhạc công khai, upload ảnh bìa lên Blob, rồi ghi sẵn URL vào `streamUrlCache` —
đúng nhánh mà endpoint stream dùng cho Dropbox/OneDrive. Lệnh in ra một dòng
`document.cookie = ...` để dán vào Console trình duyệt và vào app mà không cần
Google. Dọn dẹp: `npm run seed:demo -- --clean`.

---

## Quét thư viện

Vercel giới hạn function ở 300 giây nên không thể đọc tag vài nghìn file trong một
lần gọi. Việc quét chia thành các lô:

```
POST /api/scan              liệt kê file audio → đẩy vào hàng đợi scan_items
POST /api/scan/{id}/step    xử lý 25 file (đọc song song 8) → trả tiến độ
GET  /api/scan/{id}         trạng thái job
```

Trình duyệt gọi `step` lặp cho tới khi xong, nên thanh tiến độ là số thật và có
thể dừng giữa chừng rồi quét tiếp. Lần quét thứ hai bỏ qua file có `remoteRev`
không đổi nên nhanh hơn hẳn.

Cần chạy nền mà không phải giữ tab mở? Đó là lúc thay `step` bằng
[Vercel Workflow](https://vercel.com/docs/workflow).
