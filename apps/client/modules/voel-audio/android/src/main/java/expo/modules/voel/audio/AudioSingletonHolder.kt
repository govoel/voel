package expo.modules.voel.audio

import android.Manifest
import android.content.Context
import androidx.annotation.RequiresPermission
import androidx.core.app.NotificationManagerCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import java.io.File
import java.util.concurrent.Executor
import okhttp3.OkHttpClient

const val AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID = "voel_audio_download_service_channel"
const val AUDIO_FILES_DOWNLOAD_PATH = "VoelAudioDownloadCache"
const val AUDIO_CACHE_STREAM_PATH = "VoelAudioStreamCache"

@UnstableApi
object AudioSingletonHolder {
  @Volatile private var cookie: String? = null

  val httpClient: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .addInterceptor { chain ->
        cookie?.let {
          val originalRequest = chain.request()
          val newRequest = originalRequest.newBuilder().header("Cookie", it).build()
          chain.proceed(newRequest)
        } ?: run { chain.proceed(chain.request()) }
      }
      .build()
  }

  fun getCookie(): String? {
    return this.cookie
  }

  fun setCookie(cookie: String) {
    this.cookie = cookie
  }

  @Volatile lateinit var downloadSimpleCache: SimpleCache

  @Volatile lateinit var streamSimpleCache: SimpleCache

  fun getDownloadSimpleCache(context: Context): SimpleCache {
    if (::downloadSimpleCache.isInitialized) {
      return downloadSimpleCache
    } else {
      synchronized(this) {
        if (::downloadSimpleCache.isInitialized) {
          return downloadSimpleCache
        }

        downloadSimpleCache =
          SimpleCache(
            File(context.applicationContext.filesDir, AUDIO_FILES_DOWNLOAD_PATH),
            NoOpCacheEvictor(),
            getStandaloneDatabaseProvider(context),
          )

        return downloadSimpleCache
      }
    }
  }

  fun getStreamSimpleCache(context: Context): SimpleCache {
    if (::streamSimpleCache.isInitialized) {
      return streamSimpleCache
    } else {
      synchronized(this) {
        if (::streamSimpleCache.isInitialized) {
          return streamSimpleCache
        }

        streamSimpleCache =
          SimpleCache(
            File(context.applicationContext.cacheDir, AUDIO_CACHE_STREAM_PATH),
            LeastRecentlyUsedCacheEvictor(/* 1 GB */ 1024 * 1024 * 1024L),
            getStandaloneDatabaseProvider(context),
          )

        return streamSimpleCache
      }
    }
  }

  @Volatile lateinit var standaloneDatabaseProvider: StandaloneDatabaseProvider

  private fun getStandaloneDatabaseProvider(context: Context): StandaloneDatabaseProvider {
    if (::standaloneDatabaseProvider.isInitialized) {
      return standaloneDatabaseProvider
    } else {
      synchronized(this) {
        if (::standaloneDatabaseProvider.isInitialized) {
          return standaloneDatabaseProvider
        }

        standaloneDatabaseProvider = StandaloneDatabaseProvider(context.applicationContext)
        return standaloneDatabaseProvider
      }
    }
  }

  @Volatile lateinit var downloadManager: DownloadManager

  fun getDownloadManager(context: Context): DownloadManager {
    if (::downloadManager.isInitialized) {
      return downloadManager
    } else {
      synchronized(this) {
        if (::downloadManager.isInitialized) {
          return downloadManager
        }

        downloadManager =
          DownloadManager(
            context.applicationContext,
            getStandaloneDatabaseProvider(context),
            getDownloadSimpleCache(context),
            CacheDataSource.Factory()
              .setCache(getStreamSimpleCache(context))
              .setCacheWriteDataSinkFactory(null)
              .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(httpClient))
              .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR),
            Executor(Runnable::run),
          )

        downloadManager.addListener(
          object : DownloadManager.Listener {
            @RequiresPermission(Manifest.permission.POST_NOTIFICATIONS)
            override fun onDownloadChanged(
              downloadManager: DownloadManager,
              download: Download,
              finalException: Exception?,
            ) {
              if (
                download.state == Download.STATE_COMPLETED ||
                  download.state == Download.STATE_FAILED
              ) {
                val data = AudioDownloadData.createFromByteArray(download.request.data)

                val notificationManagerCompat =
                  NotificationManagerCompat.from(context.applicationContext)

                val hasGroup =
                  notificationManagerCompat.activeNotifications
                    .find { notification ->
                      notification.id ==
                        "${data.instanceId}-${data.bookId}-${data.fileId}".hashCode()
                    }
                    ?.notification
                    ?.group
                    ?.length ?: 0

                notificationManagerCompat.cancel(
                  "${data.instanceId}-${data.bookId}-${data.fileId}".hashCode()
                )

                val notification =
                  VoelAudioDownloadService.getNotification(context, download, hasGroup > 0, data)

                notificationManagerCompat.notify(
                  "${data.instanceId}-${data.bookId}-${data.fileId}".hashCode(),
                  notification.build(),
                )
              }
            }

            @RequiresPermission(Manifest.permission.POST_NOTIFICATIONS)
            override fun onDownloadRemoved(downloadManager: DownloadManager, download: Download) {
              val data = AudioDownloadData.createFromByteArray(download.request.data)

              val notificationManagerCompat =
                NotificationManagerCompat.from(context.applicationContext)

              val hasGroup =
                notificationManagerCompat.activeNotifications
                  .find { notification ->
                    notification.id == "${data.instanceId}-${data.bookId}-${data.fileId}".hashCode()
                  }
                  ?.notification
                  ?.group
                  ?.length ?: 0

              notificationManagerCompat.cancel(
                "${data.instanceId}-${data.bookId}-${data.fileId}".hashCode()
              )

              val notification =
                VoelAudioDownloadService.getNotification(context, download, hasGroup > 0, data)

              notificationManagerCompat.notify(
                "${data.instanceId}-${data.bookId}-${data.fileId}".hashCode(),
                notification.setContentText("Download removed").setOngoing(false).build(),
              )
            }
          }
        )

        return downloadManager
      }
    }
  }

  @Volatile lateinit var downloadNotificationHelper: DownloadNotificationHelper

  fun getDownloadNotificationHelper(context: Context): DownloadNotificationHelper {
    if (::downloadNotificationHelper.isInitialized) {
      return downloadNotificationHelper
    } else {
      synchronized(this) {
        if (::downloadNotificationHelper.isInitialized) {
          return downloadNotificationHelper
        }

        downloadNotificationHelper =
          DownloadNotificationHelper(context.applicationContext, AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID)

        return downloadNotificationHelper
      }
    }
  }
}
