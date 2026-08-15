package app.vong.audio

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Một bài trong hàng đợi, khớp `VongAudioItem` bên TypeScript. */
class VongAudioItemRecord : Record {
  @Field var id: String = ""

  @Field var url: String = ""

  /** Mảng cặp `[tên, giá trị]` giữ nguyên thứ tự JS gửi xuống. */
  @Field var headers: List<List<String>> = emptyList()

  @Field var title: String = ""

  @Field var artist: String = ""

  @Field var album: String? = null

  @Field var artworkUrl: String? = null

  @Field var durationSec: Double? = null

  fun headerMap(): Map<String, String> =
    headers.mapNotNull { pair -> if (pair.size >= 2) pair[0] to pair[1] else null }.toMap()

  /**
   * `mediaId` mang id của app: đó là đường duy nhất để `trackChanged` nói được "bài nào"
   * khi player tự nhảy bài hoặc người dùng bấm Next trên màn hình khoá.
   */
  fun toMediaItem(): MediaItem {
    val metadata = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(artist)
      .setAlbumTitle(album)
      .setArtworkUri(artworkUrl?.takeIf { it.isNotBlank() }?.let(Uri::parse))
      .setDurationMs(durationSec?.let { (it * MILLIS_PER_SECOND).toLong() })
      .setIsBrowsable(false)
      .setIsPlayable(true)
      .build()

    return MediaItem.Builder()
      .setMediaId(id)
      .setUri(url)
      .setMediaMetadata(metadata)
      .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(url)).build())
      .build()
  }

  private companion object {
    const val MILLIS_PER_SECOND = 1000.0
  }
}

/** Tham số của `setQueue`, khớp chữ ký TypeScript. */
class SetQueueOptions : Record {
  @Field var items: List<VongAudioItemRecord> = emptyList()

  @Field var startIndex: Int = 0

  @Field var positionSec: Double = 0.0
}

/**
 * Cầu nối JS ↔ [VongAudioService].
 *
 * Module **không** giữ player: player sống trong service để còn phát khi app ở nền, còn
 * đây chỉ cầm một [MediaController]. Hệ quả phải tôn trọng: mọi lệnh đều đi qua controller
 * và phải chạy trên main thread (`Queues.MAIN`) — media3 ném `IllegalStateException` nếu
 * đụng player từ thread khác.
 *
 * Bất biến quan trọng nhất ở đây là `setQueue`: khi bài đang phát không đổi (so theo
 * `mediaId`, **không** so theo index), item đó phải được giữ nguyên trong hàng đợi — không
 * `setMediaItems`, không `prepare`, không `seek`. JS gọi `setQueue` mỗi lần resolve xong
 * URL bài kế; dựng lại cả hàng đợi ở đó là mỗi lần nối bài lại giật lại từ đầu.
 */
@UnstableApi
class VongAudioModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var controllerFuture: ListenableFuture<MediaController>? = null
  private var controller: MediaController? = null

  /** Lệnh đến trước khi controller nối xong: xếp hàng chứ không ném lỗi lên JS. */
  private val pending = ArrayDeque<(MediaController) -> Unit>()
  private var ticking = false

  /** Id bài vừa báo cho JS, để không bắn `trackChanged` trùng. */
  private var lastTrackId: String? = null

  override fun definition() = ModuleDefinition {
    Name("VongAudio")

    Events("state", "ended", "trackChanged")

    OnCreate {
      val context = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()
      handler.post { connect(context) }
    }

    OnDestroy {
      handler.post { release() }
    }

    AsyncFunction("setQueue") { options: SetQueueOptions ->
      // Đăng ký header TRƯỚC khi giao hàng đợi: request đầu tiên có thể mở ngay trong
      // `prepare()`, sổ tra mà chưa có thì bài thư viện đi thiếu `Authorization`.
      PlayerHolder.replaceHeaders(options.items.associate { it.url to it.headerMap() })
      withController { applyQueue(it, options) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("play") {
      withController { player ->
        // Sau lỗi mạng player rơi về STATE_IDLE; `play()` một mình không kéo nó dậy.
        if (player.playbackState == Player.STATE_IDLE) {
          player.prepare()
        }
        player.play()
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("pause") {
      withController { it.pause() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("seek") { positionSec: Double ->
      withController { it.seekTo((positionSec * MILLIS_PER_SECOND).toLong().coerceAtLeast(0L)) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("skipNext") {
      withController { player ->
        if (player.hasNextMediaItem()) {
          player.seekToNextMediaItem()
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("skipPrev") {
      withController { player ->
        if (player.hasPreviousMediaItem()) {
          player.seekToPreviousMediaItem()
        } else {
          player.seekTo(0L)
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setVolume") { volume: Double ->
      withController { it.setVolume(volume.toFloat().coerceIn(0f, 1f)) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getState") {
      stateBundle()
    }.runOnQueue(Queues.MAIN)
  }

  private fun connect(context: Context) {
    val token = SessionToken(context, ComponentName(context, VongAudioService::class.java))
    // Ghim looper: `MediaController` bắt buộc mọi lệnh và mọi callback đi trên đúng
    // looper này, và đó phải là main thread vì `Queues.MAIN` cũng chạy ở đó.
    val future = MediaController.Builder(context, token)
      .setApplicationLooper(Looper.getMainLooper())
      .buildAsync()
    controllerFuture = future
    future.addListener(
      {
        val connected = runCatching { future.get() }.getOrNull() ?: return@addListener
        controller = connected
        // Service có thể còn sống từ phiên trước (app bị kill nhưng nhạc vẫn chạy):
        // ghi nhận bài đang phát để không bắn `trackChanged` cho một bài JS đã biết.
        lastTrackId = connected.currentMediaItem?.mediaId
        connected.addListener(playerListener)
        while (pending.isNotEmpty()) {
          pending.removeFirst().invoke(connected)
        }
        syncTicking()
      },
      ContextCompat.getMainExecutor(context),
    )
  }

  private fun release() {
    stopTicking()
    pending.clear()
    controller?.removeListener(playerListener)
    controller = null
    controllerFuture?.let { MediaController.releaseFuture(it) }
    controllerFuture = null
    lastTrackId = null
  }

  private fun withController(block: (MediaController) -> Unit) {
    val connected = controller
    if (connected != null && connected.isConnected) {
      block(connected)
    } else {
      pending.addLast(block)
    }
  }

  private fun applyQueue(player: MediaController, options: SetQueueOptions) {
    val items = options.items
    if (items.isEmpty()) {
      // `stop()` TRƯỚC `clearMediaItems()`: hàng đợi rỗng khi player chưa IDLE sẽ chuyển
      // thẳng sang STATE_ENDED và bắn `ended` giả về JS, khiến JS tưởng hết bài và nhảy tiếp.
      player.stop()
      player.clearMediaItems()
      lastTrackId = null
      return
    }

    val startIndex = options.startIndex.coerceIn(0, items.size - 1)
    val currentId = player.currentMediaItem?.mediaId
    if (currentId != null && currentId == items[startIndex].id) {
      replaceAround(player, items, startIndex)
      return
    }

    player.setMediaItems(
      items.map { it.toMediaItem() },
      startIndex,
      (options.positionSec * MILLIS_PER_SECOND).toLong().coerceAtLeast(0L),
    )
    player.prepare()
  }

  /**
   * Thay mọi thứ quanh bài đang phát mà không đụng vào chính nó.
   *
   * Cắt đuôi trước rồi cắt đầu: sau hai lệnh đó hàng đợi còn đúng một item — bài đang phát,
   * ở index 0 — nhưng ExoPlayer chưa từng phải dựng lại `MediaSource` của nó nên tiếng
   * không gợn. Chèn lại `head`/`tail` đưa index về đúng `startIndex` mà JS gửi xuống.
   */
  private fun replaceAround(player: MediaController, items: List<VongAudioItemRecord>, startIndex: Int) {
    val index = player.currentMediaItemIndex
    if (player.mediaItemCount > index + 1) {
      player.removeMediaItems(index + 1, player.mediaItemCount)
    }
    if (index > 0) {
      player.removeMediaItems(0, index)
    }

    val head = items.subList(0, startIndex).map { it.toMediaItem() }
    if (head.isNotEmpty()) {
      player.addMediaItems(0, head)
    }
    val tail = items.subList(startIndex + 1, items.size).map { it.toMediaItem() }
    if (tail.isNotEmpty()) {
      player.addMediaItems(tail)
    }
  }

  private fun stateBundle(): Bundle {
    val player = controller
    if (player == null || !player.isConnected) {
      return bundleOf(
        "index" to 0,
        "positionSec" to 0.0,
        "durationSec" to 0.0,
        "playing" to false,
        "buffering" to false,
      )
    }

    // `duration` là TIME_UNSET tới khi đọc xong `moov`; rơi về thời lượng metadata để
    // thanh thời gian bên JS không nhảy từ 0 lên giá trị thật sau vài giây.
    val durationMs = player.duration.takeIf { it != C.TIME_UNSET && it > 0L }
      ?: player.mediaMetadata.durationMs?.takeIf { it > 0L }
      ?: 0L

    return bundleOf(
      "index" to player.currentMediaItemIndex,
      "positionSec" to player.currentPosition.coerceAtLeast(0L) / MILLIS_PER_SECOND,
      "durationSec" to durationMs / MILLIS_PER_SECOND,
      "playing" to player.intendsToPlay(),
      "buffering" to (player.playbackState == Player.STATE_BUFFERING),
    )
  }

  /**
   * Ý MUỐN phát, không phải "tiếng đang ra".
   *
   * `isPlaying` của media3 còn false suốt lúc nạp đệm, mà bên JS `playing` được hiểu là
   * ý muốn của người nghe: báo `isPlaying` là mỗi lần đổi bài store lại tự tắt cờ phát
   * (nhịp `state` đến giữa lúc buffering) rồi effect phát/dừng gọi `pause()` — bài đứng
   * im ở giây 0 dù byte đã về. Trạng thái nạp đệm đã có trường `buffering` riêng.
   *
   * Loại `ENDED`/`IDLE` ra: ở hai trạng thái đó `playWhenReady` vẫn còn true (hết hàng đợi,
   * hoặc lỗi mạng) nhưng không có gì đang chạy — báo true là store và native giằng nhau.
   */
  private fun MediaController.intendsToPlay(): Boolean =
    playWhenReady &&
      playbackState != Player.STATE_ENDED &&
      playbackState != Player.STATE_IDLE

  private fun emitState() {
    sendEvent("state", stateBundle())
  }

  private val ticker = object : Runnable {
    override fun run() {
      val player = controller
      if (player == null || !player.isConnected) {
        ticking = false
        return
      }
      emitState()
      if (player.intendsToPlay()) {
        handler.postDelayed(this, TICK_INTERVAL_MS)
      } else {
        ticking = false
      }
    }
  }

  /** Nhịp chỉ chạy khi còn ý muốn phát: đứng yên mà vẫn bắn event là đánh thức JS vô ích. */
  private fun startTicking() {
    if (ticking) {
      return
    }
    ticking = true
    handler.post(ticker)
  }

  private fun stopTicking() {
    ticking = false
    handler.removeCallbacks(ticker)
  }

  /** Bật/tắt nhịp theo ý muốn phát hiện tại, và luôn báo trạng thái mới về JS. */
  private fun syncTicking() {
    val player = controller
    if (player != null && player.isConnected && player.intendsToPlay()) {
      startTicking()
      return
    }
    stopTicking()
    emitState()
  }

  private val playerListener = object : Player.Listener {
    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      // Chỉ báo khi bài THẬT SỰ đổi: `setMediaItems` cũng kích callback này, mà JS lấy
      // `trackChanged` làm mốc để resolve URL bài kế — báo trùng là resolve thừa một vòng.
      val id = mediaItem?.mediaId
      if (id != lastTrackId) {
        lastTrackId = id
        if (id != null) {
          sendEvent(
            "trackChanged",
            bundleOf(
              "index" to (controller?.currentMediaItemIndex ?: 0),
              "id" to id,
            ),
          )
        }
      }
      emitState()
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
      if (playbackState == Player.STATE_ENDED) {
        sendEvent("ended", Bundle.EMPTY)
      }
      emitState()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      syncTicking()
    }

    /**
     * Nạp đệm xong hay người dùng bấm phát/dừng trên màn hình khoá đều đổi cờ này. Không
     * bắt riêng nó thì lúc đang nạp đệm nhịp đứng im, JS không thấy cờ phát bật lên.
     */
    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
      syncTicking()
    }

    override fun onPositionDiscontinuity(
      oldPosition: Player.PositionInfo,
      newPosition: Player.PositionInfo,
      reason: Int,
    ) {
      // Tua khi đang tạm dừng không có nhịp nào chạy, phải tự báo vị trí mới.
      emitState()
    }

    override fun onPlayerError(error: PlaybackException) {
      emitState()
    }
  }

  private companion object {
    const val TICK_INTERVAL_MS = 400L
    const val MILLIS_PER_SECOND = 1000.0
  }
}
