package app.vong.audio

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * `MediaSessionService` giữ đúng một `ExoPlayer` cho cả vòng đời app.
 *
 * Vì sao là service chứ không phải player nằm trong module: chỉ service ở chế độ
 * foreground mới được phát tiếp khi màn hình khoá hoặc app bị đẩy ra nền, và chỉ
 * `MediaSession` mới nối được nút Play/Pause/Next/Previous của màn hình khoá với player.
 * `MediaSession.Builder` mặc định cấp đủ bộ lệnh cho controller — cố tình **không** gỡ
 * `COMMAND_SEEK_TO_NEXT/PREVIOUS_MEDIA_ITEM`, vì đó chính là thứ làm hai nút kia biến mất
 * ở các thư viện khác.
 *
 * Service tự `stopSelf()` khi hàng đợi rỗng. Lúc đó module vẫn đang bind (qua
 * `MediaController`) nên đối tượng service còn sống, chỉ mất trạng thái "started" —
 * notification biến mất, hệ thống thu hồi được tiến trình, mà JS không bị rớt kết nối.
 */
@UnstableApi
class VongAudioService : MediaSessionService() {
  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()

    val player = ExoPlayer.Builder(this)
      .setMediaSourceFactory(
        // Đây là lý do tồn tại của cả module: mọi byte phải đi qua RangeForcingDataSource.
        DefaultMediaSourceFactory(this).setDataSourceFactory(RangeForcingDataSource.Factory()),
      )
      // Giữ 30 giây đã phát trong bộ đệm: tua LÙI trong khoảng đó là tức thì, không phải
      // mở lại request tới googlevideo (mỗi lần mở lại là một quãng im chờ byte đầu). Tua
      // TỚI ngoài đệm vẫn phải nạp, nhưng nghe lại đoạn vừa qua — thao tác hay gặp nhất
      // khi rà bài — thì mượt hẳn.
      .setLoadControl(
        DefaultLoadControl.Builder()
          .setBackBuffer(30_000, /* retainBackBufferFromKeyframe = */ true)
          .build(),
      )
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(C.USAGE_MEDIA)
          .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
          .build(),
        /* handleAudioFocus = */ true,
      )
      // Rút tai nghe ra thì dừng, không phát oang oang qua loa ngoài.
      .setHandleAudioBecomingNoisy(true)
      // Giữ CPU + Wi-Fi khi màn hình tắt; thiếu nó là nhạc đứt giữa chừng khi khoá máy.
      .setWakeMode(C.WAKE_MODE_NETWORK)
      .build()

    player.addListener(EmptyQueueWatcher())

    val builder = MediaSession.Builder(this, player)
    sessionActivityIntent()?.let { builder.setSessionActivity(it) }
    session = builder.build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  /** Vuốt app khỏi danh sách gần đây: đang phát thì giữ nguyên, không thì dọn luôn. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    val player = session?.player
    if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    session?.run {
      player.release()
      release()
    }
    session = null
    PlayerHolder.clear()
    super.onDestroy()
  }

  /** Chạm vào notification thì mở lại app thay vì không làm gì. */
  private fun sessionActivityIntent(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private inner class EmptyQueueWatcher : Player.Listener {
    override fun onTimelineChanged(timeline: Timeline, reason: Int) {
      if (timeline.isEmpty) {
        stopSelf()
      }
    }
  }
}
