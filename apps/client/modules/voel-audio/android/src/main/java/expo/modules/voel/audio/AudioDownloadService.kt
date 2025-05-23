package expo.modules.voel.audio

import android.app.Notification
import androidx.annotation.OptIn
import androidx.media3.common.util.NotificationUtil
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler
import java.util.concurrent.Executor

const val AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID = "voel_audio_download_service_channel"

@OptIn(UnstableApi::class)
class VoelAudioDownloadService :
  DownloadService(
    1,
    DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
    AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID,
    R.string.voel_audio_download_service_channel_name,
    R.string.voel_audio_download_service_channel_description
  ) {

  private val dlManager: DownloadManager by lazy {
    DownloadManager(
      this,
      AudioCacheDatabaseProvider.get(this),
      AudioSingletonHolder.getDownloadSimpleCache(this),
      CacheDataSource.Factory()
        .setCache(
          AudioSingletonHolder.getStreamSimpleCache(this)
        )
        .setCacheWriteDataSinkFactory(null)
        .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(AudioSingletonHolder.httpClient))
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR),
      Executor(Runnable::run)
    )
  }


  private val downloadNotificationHelper: DownloadNotificationHelper by lazy {
    DownloadNotificationHelper(this, AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID)
  }

  override fun onCreate() {
    super.onCreate()

    dlManager.addListener(object : DownloadManager.Listener {
      var nextNotificationId = 2

      override fun onDownloadChanged(
        downloadManager: DownloadManager,
        download: Download,
        finalException: Exception?
      ) {
        if (download.state == Download.STATE_COMPLETED) {
          buildDownloadCompletedNotification(nextNotificationId++, download)
        } else if (download.state == Download.STATE_FAILED) {
          buildDownloadFailedNotification(nextNotificationId++, download)
        }
      }
    })
  }

  private fun buildDownloadCompletedNotification(notificationId: Int, download: Download) {
    NotificationUtil.setNotification(
      this,
      notificationId,
      downloadNotificationHelper.buildDownloadCompletedNotification(
        this,
        R.drawable.voel_logo,
        null,
        download.request.data.decodeToString()
      )
    )
  }

  private fun buildDownloadFailedNotification(notificationId: Int, download: Download) {
    NotificationUtil.setNotification(
      this,
      notificationId,
      downloadNotificationHelper.buildDownloadFailedNotification(
        this,
        R.drawable.voel_logo,
        null,
        download.request.data.decodeToString()
      )
    )
  }

  override fun getDownloadManager(): DownloadManager {
    return dlManager
  }

  override fun getScheduler(): Scheduler? {
    return null
  }

  override fun getForegroundNotification(
    downloads: MutableList<Download>,
    notMetRequirements: Int
  ): Notification {
    return downloadNotificationHelper.buildProgressNotification(
      this,
      R.drawable.voel_logo,
      null,
      if (downloads.size == 1) "Downloading audiobook file..." else "Downloading audiobook files...",
      downloads,
      notMetRequirements
    )
  }
}
