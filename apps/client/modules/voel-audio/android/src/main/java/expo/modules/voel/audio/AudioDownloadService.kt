package expo.modules.voel.audio

import android.app.Notification
import android.content.Context
import androidx.annotation.OptIn
import androidx.annotation.RequiresPermission
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.NotificationManagerCompat.NotificationWithIdAndTag
import androidx.media3.common.C
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
    R.string.voel_audio_download_service_channel_description,
  ) {
  override fun getDownloadManager(): DownloadManager {
    return AudioSingletonHolder.getDownloadManager(this)
  }

  override fun getScheduler(): Scheduler? {
    return null
  }

  @RequiresPermission(android.Manifest.permission.POST_NOTIFICATIONS)
  override fun getForegroundNotification(
    downloads: MutableList<Download>,
    notMetRequirements: Int,
  ): Notification {
    val bookNotificationsCreated = mutableSetOf<String>()
    val notificationWithIdAndTag = mutableListOf<NotificationWithIdAndTag>()

    val groupedDownloads =
      downloads.groupBy { download ->
        val data = AudioDownloadData.createFromByteArray(download.request.data)
        "${data.instanceId}-${data.bookId}"
      }

    groupedDownloads.forEach { (key, downloads) ->
      downloads.forEach { download ->
        val data = AudioDownloadData.createFromByteArray(download.request.data)
        val notification = getNotification(this, download, downloads.size > 1, data)

        if (
          downloads.size > 1 &&
            !bookNotificationsCreated.contains("${data.instanceId}-${data.bookId}")
        ) {
          notificationWithIdAndTag.add(
            NotificationWithIdAndTag(
              "${data.instanceId}-${data.bookId}".hashCode(),
              NotificationCompat.Builder(this.applicationContext, AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID)
                .setSmallIcon(R.drawable.voel_logo)
                .setGroup(
                  "${this.applicationContext.packageName}.DOWNLOAD_BOOK_${data.instanceId}_${data.bookId}"
                )
                .setGroupSummary(true)
                .setStyle(
                  NotificationCompat.BigTextStyle()
                    .setSummaryText(
                      if (data.bookAuthors.isNotEmpty()) "${data.bookTitle} by ${data.bookAuthors}"
                      else data.bookTitle
                    )
                )
                .build(),
            )
          )
          bookNotificationsCreated.add("${data.instanceId}-${data.bookId}")
        }

        notificationWithIdAndTag.add(
          NotificationWithIdAndTag(
            "${data.instanceId}-${data.bookId}-${data.fileId}".hashCode(),
            notification.build(),
          )
        )
      }
    }

    NotificationManagerCompat.from(this.applicationContext).notify(notificationWithIdAndTag)

    return AudioSingletonHolder.getDownloadNotificationHelper(this)
      .buildProgressNotification(
        this,
        R.drawable.voel_logo,
        null,
        if (downloads.size > 1) "Downloading ${downloads.size} files" else "Downloading 1 file",
        downloads,
        notMetRequirements,
      )
  }

  companion object {
    fun getNotification(
      context: Context,
      download: Download,
      inGroup: Boolean,
      data: AudioDownloadData = AudioDownloadData.createFromByteArray(download.request.data),
    ): NotificationCompat.Builder {
      val notification =
        NotificationCompat.Builder(context.applicationContext, AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID)
          .setSmallIcon(R.drawable.voel_logo)
          .setContentTitle(
            if (inGroup) "File #${data.fileId}"
            else if (data.bookAuthors.isNotEmpty()) "${data.bookTitle} by ${data.bookAuthors}"
            else data.bookTitle
          )

      if (inGroup) {
        notification.setGroup(
          "${context.applicationContext.packageName}.DOWNLOAD_BOOK_${data.instanceId}_${data.bookId}"
        )
      }

      when (download.state) {
        Download.STATE_DOWNLOADING -> {
          if (AudioSingletonHolder.getDownloadManager(context).downloadsPaused) {
            notification.setContentText("Download paused")
          } else {
            notification.setContentText("Downloading")
          }

          notification.setProgress(
            100,
            if (download.percentDownloaded == C.PERCENTAGE_UNSET.toFloat()) 0
            else (download.percentDownloaded).toInt(),
            download.contentLength == C.LENGTH_UNSET.toLong(),
          )
          notification.setOngoing(true)

          if (inGroup) {
            notification.setSortKey("1-${data.instanceId}-${data.bookId}-${data.fileId}")
          }

          if (download.percentDownloaded == C.PERCENTAGE_UNSET.toFloat()) {
            notification.setProgress(0, 0, true)
          } else {
            notification.setProgress(100, download.percentDownloaded.toInt(), false)
          }
        }

        Download.STATE_COMPLETED -> {
          notification.setContentText("Download completed")
          notification.setOngoing(false)

          if (inGroup) {
            notification.setSortKey("3-${data.instanceId}-${data.bookId}-${data.fileId}")
          }
        }

        Download.STATE_FAILED -> {
          notification.setContentText("Download failed")
          notification.setOngoing(false)

          if (inGroup) {
            notification.setSortKey("2-${data.instanceId}-${data.bookId}-${data.fileId}")
          }
        }

        Download.STATE_QUEUED -> {
          notification.setContentText("Download queued")
          notification.setOngoing(true)

          if (inGroup) {
            notification.setSortKey("4-${data.instanceId}-${data.bookId}-${data.fileId}")
          }
        }

        Download.STATE_REMOVING -> {
          notification.setContentText("Removing download")
          notification.setOngoing(true)

          if (inGroup) {
            notification.setSortKey("5-${data.instanceId}-${data.bookId}-${data.fileId}")
          }
        }

        Download.STATE_RESTARTING -> {
          notification.setContentText("Restarting download")
          notification.setOngoing(true)

          if (inGroup) {
            notification.setSortKey("6-${data.instanceId}-${data.bookId}-${data.fileId}")
          }
        }

        Download.STATE_STOPPED -> {
          notification.setContentText("Download stopped")
          notification.setOngoing(false)

          if (inGroup) {
            notification.setSortKey("7-${data.instanceId}-${data.bookId}-${data.fileId}")
          }
        }
      }

      return notification
    }
  }
}
