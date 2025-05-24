package expo.modules.voel.audio

import android.content.Context
import android.util.Log
import androidx.media3.common.util.NotificationUtil
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
import expo.modules.core.utilities.ifNull
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.Executor

const val AUDIO_DOWNLOAD_SERVICE_CHANNEL_ID = "voel_audio_download_service_channel"
const val AUDIO_FILES_DOWNLOAD_PATH = "VoelAudioDownloadCache"
const val AUDIO_CACHE_STREAM_PATH = "VoelAudioStreamCache"

@UnstableApi
object AudioSingletonHolder {
  @Volatile
  private var cookie: String? = null

  val httpClient: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .addInterceptor { chain ->
        cookie?.let {
          val originalRequest = chain.request()
          val newRequest =
            originalRequest.newBuilder().header("Cookie", it).build()
          chain.proceed(newRequest)
        }
          ?: run { chain.proceed(chain.request()) }
      }
      .build()
  }

  fun getCookie(): String? {
    return this.cookie
  }

  fun setCookie(cookie: String) {
    this.cookie = cookie
  }

  @Volatile
  lateinit var downloadSimpleCache: SimpleCache

  @Volatile
  lateinit var streamSimpleCache: SimpleCache

  fun getDownloadSimpleCache(context: Context): SimpleCache {
    if (::downloadSimpleCache.isInitialized) {
      return downloadSimpleCache
    } else {
      synchronized(this) {
        if (::downloadSimpleCache.isInitialized) {
          return downloadSimpleCache
        }

        downloadSimpleCache = SimpleCache(
          File(context.applicationContext.filesDir, AUDIO_FILES_DOWNLOAD_PATH),
          NoOpCacheEvictor(),
          getStandaloneDatabaseProvider(context)
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

        streamSimpleCache = SimpleCache(
          File(context.applicationContext.cacheDir, AUDIO_CACHE_STREAM_PATH),
          LeastRecentlyUsedCacheEvictor(/* 1 GB */ 1024 * 1024 * 1024L),
          getStandaloneDatabaseProvider(context)
        )

        return streamSimpleCache
      }
    }
  }

  @Volatile
  lateinit var standaloneDatabaseProvider: StandaloneDatabaseProvider

  private fun getStandaloneDatabaseProvider(context: Context): StandaloneDatabaseProvider {
    if (::standaloneDatabaseProvider.isInitialized) {
      Log.d(
        "VoelAudioSingletonHolder",
        "Returning init'd database provider: ${standaloneDatabaseProvider.ifNull { "NULL" }}"
      )
      return standaloneDatabaseProvider
    } else {
      synchronized(this) {
        if (::standaloneDatabaseProvider.isInitialized) {
          Log.d(
            "VoelAudioSingletonHolder",
            "Returning pre-init'd database provider: ${standaloneDatabaseProvider.ifNull { "NULL" }}"
          )
          return standaloneDatabaseProvider
        }

        standaloneDatabaseProvider = StandaloneDatabaseProvider(context.applicationContext)
        Log.d(
          "VoelAudioSingletonHolder",
          "Returning new database provider: ${standaloneDatabaseProvider.ifNull { "NULL" }}"
        )
        return standaloneDatabaseProvider
      }
    }
  }

  @Volatile
  lateinit var downloadManager: DownloadManager

  fun getDownloadManager(context: Context): DownloadManager {
    if (::downloadManager.isInitialized) {
      return downloadManager
    } else {
      synchronized(this) {
        if (::downloadManager.isInitialized) {
          return downloadManager
        }

        downloadManager = DownloadManager(
          context.applicationContext,
          getStandaloneDatabaseProvider(context),
          getDownloadSimpleCache(context),
          CacheDataSource.Factory()
            .setCache(getStreamSimpleCache(context))
            .setCacheWriteDataSinkFactory(null)
            .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(httpClient))
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR),
          Executor(Runnable::run)
        )

        downloadManager.addListener(object : DownloadManager.Listener {
          var nextNotificationId = 2

          override fun onDownloadChanged(
            downloadManager: DownloadManager,
            download: Download,
            finalException: Exception?
          ) {
            if (download.state == Download.STATE_COMPLETED) {
              NotificationUtil.setNotification(
                context.applicationContext,
                nextNotificationId++,
                getDownloadNotificationHelper(context).buildDownloadCompletedNotification(
                  context.applicationContext,
                  R.drawable.voel_logo,
                  null,
                  download.request.data.decodeToString()
                )
              )
            } else if (download.state == Download.STATE_FAILED) {
              NotificationUtil.setNotification(
                context.applicationContext,
                nextNotificationId++,
                getDownloadNotificationHelper(context).buildDownloadFailedNotification(
                  context.applicationContext,
                  R.drawable.voel_logo,
                  null,
                  download.request.data.decodeToString()
                )
              )
            }
          }
        })

        return downloadManager
      }
    }
  }

  @Volatile
  lateinit var downloadNotificationHelper: DownloadNotificationHelper

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
