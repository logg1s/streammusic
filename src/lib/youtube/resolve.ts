import { Innertube } from "youtubei.js";
import { LANGUAGE_CODE, REGION_CODE } from "@/lib/youtube/locale";

/**
 * Phiên InnerTube khách dùng chung cho tìm kiếm / automix / hàng gợi ý trang chủ
 * (`src/lib/youtube/music.ts`).
 *
 * KHÔNG còn nhánh resolve URL audio ở đây: byte của bài YouTube giờ do chính máy
 * người dùng lấy — web phát bằng IFrame Player API, còn vỏ native resolve bằng
 * `@vong/shared/player-request`. IP máy chủ Vercel bị YouTube trả `LOGIN_REQUIRED`
 * ở `/youtubei/v1/player`, nên resolve phía server không bao giờ là đường tin được.
 *
 * KHÔNG gắn cookie: cookie loại bỏ `VISIONOS`/`ANDROID_VR` và đẩy phiên sang `web`
 * (DRM + SABR + PO token). Bên nào cần cá nhân hoá thì tự dựng phiên riêng —
 * `music.ts#feedSession` làm đúng vậy.
 */

let cached: Innertube | null = null;
let cachedVisitorData: string | undefined;

/**
 * `retrieve_player: false` bỏ hẳn việc tải + eval player JS — các API dùng phiên này
 * chỉ đọc metadata, không cần giải mã signature. `visitorData` khách là thứ biến
 * `LOGIN_REQUIRED` thành `OK`, nên giữ lại giữa các lần gọi.
 *
 * `lang`/`location` ghim theo `locale.ts`: InnerTube đoán vùng theo IP máy gọi, nên
 * máy chủ ở Mỹ sẽ trả gợi ý Mỹ. Ghim để chạy ở đâu cũng ra cùng thứ nhạc.
 */
export async function innertube(): Promise<Innertube> {
  if (cached) return cached;
  const yt = await Innertube.create({
    lang: LANGUAGE_CODE,
    location: REGION_CODE,
    retrieve_player: false,
    generate_session_locally: false,
    enable_session_cache: false,
    visitor_data: cachedVisitorData,
  });
  cachedVisitorData = yt.session.context.client.visitorData;
  cached = yt;
  return yt;
}

export function resetInnertube(): void {
  cached = null;
  cachedVisitorData = undefined;
}
