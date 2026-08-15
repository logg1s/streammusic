package app.vong.audio

import java.util.concurrent.ConcurrentHashMap

/**
 * Sổ tra header theo URL, dùng chung giữa module (nơi JS gửi hàng đợi xuống) và
 * `RangeForcingDataSource` (nơi request thật sự được mở).
 *
 * Vì sao phải có: media3 **không** mang header của `MediaItem` xuống `DataSpec`.
 * `DefaultMediaSourceFactory` dựng `DataSpec` chỉ từ `localConfiguration.uri`, còn
 * `MediaItem.RequestMetadata` thì chỉ để trả về cho controller — nên `Authorization:
 * Bearer` gắn vào `MediaItem` sẽ biến mất trước khi tới `DefaultHttpDataSource`.
 * Cách duy nhất còn lại là tra ngược theo URL ngay trong `open()`.
 *
 * Module và service nằm cùng tiến trình (thẻ `<service>` không khai `android:process`),
 * nên một `object` Kotlin là đủ để hai bên nhìn thấy nhau.
 */
internal object PlayerHolder {
  private val headersByUrl = ConcurrentHashMap<String, Map<String, String>>()

  /**
   * Thay toàn bộ sổ bằng hàng đợi mới. Giữ nguyên `retainAll` thay vì `clear()` rồi
   * `putAll()`: bài đang phát luôn nằm trong hàng đợi mới, làm thế thì nó không bao giờ
   * biến mất khỏi sổ dù chỉ trong một khoảnh khắc — ExoPlayer có thể mở lại request
   * (tua, nối lại mạng) đúng lúc đó và sẽ đi thiếu header.
   */
  fun replaceHeaders(entries: Map<String, Map<String, String>>) {
    headersByUrl.putAll(entries)
    headersByUrl.keys.retainAll(entries.keys)
  }

  fun headersFor(url: String): Map<String, String>? = headersByUrl[url]

  fun clear() {
    headersByUrl.clear()
  }
}
