package expo.modules.voel.audio

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import okhttp3.OkHttpClient
import java.io.File

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

  lateinit var downloadSimpleCache: SimpleCache
  lateinit var streamSimpleCache: SimpleCache

  fun getDownloadSimpleCache(context: Context): SimpleCache {
    if (::downloadSimpleCache.isInitialized) {
      return downloadSimpleCache
    } else {
      synchronized(this) {
        downloadSimpleCache = SimpleCache(
          File(context.filesDir, AUDIO_FILES_DOWNLOAD_PATH),
          NoOpCacheEvictor(),
          AudioCacheDatabaseProvider.get(context)
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
        streamSimpleCache = SimpleCache(
          File(context.cacheDir, AUDIO_CACHE_STREAM_PATH),
          LeastRecentlyUsedCacheEvictor(/* 1 GB */ 1024 * 1024 * 1024L),
          AudioCacheDatabaseProvider.get(context)
        )

        return streamSimpleCache
      }
    }
  }
}
