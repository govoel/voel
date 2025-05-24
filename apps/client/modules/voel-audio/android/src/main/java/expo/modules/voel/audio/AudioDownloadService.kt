package expo.modules.voel.audio

import android.app.Notification
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler

@OptIn(UnstableApi::class)
class VoelAudioDownloadService :
  DownloadService(
    1,
    300L,
    AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID,
    R.string.voel_audio_download_service_channel_name,
    R.string.voel_audio_download_service_channel_description
  ) {
  override fun getDownloadManager(): DownloadManager {
    return AudioSingletonHolder.getDownloadManager(this)
  }

  override fun getScheduler(): Scheduler? {
    return null
  }

  override fun getForegroundNotification(
    downloads: MutableList<Download>,
    notMetRequirements: Int
  ): Notification {
    return AudioSingletonHolder.getDownloadNotificationHelper(this).buildProgressNotification(
      this,
      R.drawable.voel_logo,
      null,
      if (downloads.size == 1) "Downloading audiobook file..." else "Downloading audiobook files...",
      downloads,
      notMetRequirements
    )
  }
}
