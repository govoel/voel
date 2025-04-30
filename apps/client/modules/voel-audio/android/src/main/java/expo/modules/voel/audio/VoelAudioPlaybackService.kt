package expo.modules.voel.audio

import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import java.io.File
import okhttp3.OkHttpClient

class VoelAudioPlaybackService : MediaSessionService() {
    lateinit var player: ExoPlayer
    var mediaSession: MediaSession? = null

    companion object {
        @Volatile private var cookie: String? = null

        private val httpClient: OkHttpClient by lazy {
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

        fun setCookie(cookie: String) {
            this.cookie = cookie
        }
    }

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        super.onCreate()

        setMediaNotificationProvider(
                DefaultMediaNotificationProvider.Builder(this).build().apply {
                    setSmallIcon(R.drawable.voel_logo)
                }
        )

        player =
                ExoPlayer.Builder(this)
                        .setMediaSourceFactory(
                                DefaultMediaSourceFactory(
                                        CacheDataSource.Factory()
                                                .setCache(
                                                        SimpleCache(
                                                                File(
                                                                        this.cacheDir,
                                                                        "VoelAudioPlaybackServiceCache"
                                                                ),
                                                                LeastRecentlyUsedCacheEvictor(
                                                                        // 1GB
                                                                        1024 * 1024 * 1024L
                                                                ),
                                                                StandaloneDatabaseProvider(this)
                                                        )
                                                )
                                                .setUpstreamDataSourceFactory(
                                                        OkHttpDataSource.Factory(httpClient)
                                                )
                                                .setFlags(
                                                        CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR
                                                )
                                )
                        )
                        .setUsePlatformDiagnostics(false)
                        .setAudioAttributes(
                                AudioAttributes.Builder()
                                        .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                                        .setUsage(C.USAGE_MEDIA)
                                        .setAllowedCapturePolicy(C.ALLOW_CAPTURE_BY_ALL)
                                        .build(),
                                true
                        )
                        .build()

        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }
}
