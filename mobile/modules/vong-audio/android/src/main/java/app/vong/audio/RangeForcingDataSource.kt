package app.vong.audio

import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener

/**
 * `DataSource` bọc `DefaultHttpDataSource` để ép hai thứ mà media3 không tự làm.
 *
 * 1. **`Range` trên MỌI request.** `HttpUtil.buildRangeRequestHeader(position, length)` trả
 *    `null` khi `position == 0` và `length == C.LENGTH_UNSET` — đúng hình dạng của request
 *    đầu tiên — nên ExoPlayer nạp bài mà không có header `Range`. googlevideo phục vụ
 *    request không `Range` ở ~32 KiB/s (đo: 4,5 MB mất 141 giây), trong khi cùng URL với
 *    `Range: bytes=0-` trả `206` ở ~31 MiB/s. Nghe thì vẫn ra tiếng, nhưng tua là chết.
 *    Ta chèn header khoảng mở trước khi gọi xuống; ở các request sau (`position > 0`)
 *    `DefaultHttpDataSource` tự dựng `Range` chặt hơn và ghi đè — không sao, vẫn có header.
 * 2. **Header riêng từng bài.** Xem [PlayerHolder]: `Authorization: Bearer` của
 *    `/api/stream/<id>` không đi theo `MediaItem` được, phải tra ngược theo URL ở đây.
 */
@UnstableApi
internal class RangeForcingDataSource(private val upstream: HttpDataSource) : DataSource {
  override fun addTransferListener(transferListener: TransferListener) {
    upstream.addTransferListener(transferListener)
  }

  override fun open(dataSpec: DataSpec): Long {
    val extraHeaders = LinkedHashMap<String, String>()
    PlayerHolder.headersFor(dataSpec.uri.toString())?.let(extraHeaders::putAll)
    // Khoảng mở, không cắt lô: googlevideo trả cả phần còn lại ở full tốc, cắt 1 MiB
    // chỉ tạo thêm vòng bắt tay TLS chứ không nhanh hơn.
    extraHeaders[RANGE_HEADER] = "bytes=${dataSpec.position}-"
    return upstream.open(dataSpec.withAdditionalHeaders(extraHeaders))
  }

  override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
    upstream.read(buffer, offset, length)

  override fun getUri(): Uri? = upstream.uri

  override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

  override fun close() {
    upstream.close()
  }

  @UnstableApi
  internal class Factory : DataSource.Factory {
    private val upstreamFactory = DefaultHttpDataSource.Factory()
      // `/api/stream/<id>` chuyển hướng 302 sang Dropbox/OneDrive, đôi khi đổi cả scheme.
      .setAllowCrossProtocolRedirects(true)
      .setConnectTimeoutMs(CONNECT_TIMEOUT_MS)
      .setReadTimeoutMs(READ_TIMEOUT_MS)

    override fun createDataSource(): DataSource = RangeForcingDataSource(upstreamFactory.createDataSource())
  }

  private companion object {
    const val RANGE_HEADER = "Range"
    const val CONNECT_TIMEOUT_MS = 15_000
    const val READ_TIMEOUT_MS = 20_000
  }
}
