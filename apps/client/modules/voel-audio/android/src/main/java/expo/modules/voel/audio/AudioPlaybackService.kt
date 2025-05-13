package expo.modules.voel.audio

import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingSimpleBasePlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.Clock
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
import com.google.common.util.concurrent.ListenableFuture
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

class VoelAudioPlaybackService : MediaSessionService() {
    lateinit var player: ExoPlayer
    var mediaSession: MediaSession? = null
    private val playbackHistoryJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + playbackHistoryJob)

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

        val forwardingPlayer =
                object : ForwardingSimpleBasePlayer(player) {
                    override fun handleSeek(
                            mediaItemIndex: Int,
                            positionMs: Long,
                            seekCommand: Int
                    ): ListenableFuture<*> {
                        recordPosition(player, EVENT_TYPE_SEEK_START)
                        val superReturn = super.handleSeek(mediaItemIndex, positionMs, seekCommand)
                        recordPosition(player, EVENT_TYPE_SEEK_END)
                        return superReturn
                    }

                    override fun handleSetPlayWhenReady(
                            playWhenReady: Boolean
                    ): ListenableFuture<*> {
                        val superReturn = super.handleSetPlayWhenReady(playWhenReady)
                        recordPosition(
                                player,
                                if (playWhenReady) EVENT_TYPE_PLAY else EVENT_TYPE_PAUSE
                        )
                        return superReturn
                    }

                    override fun handleRelease(): ListenableFuture<*> {
                        recordPosition(player, EVENT_TYPE_SESSION_END)
                        return super.handleRelease()
                    }

                    override fun handleSetMediaItems(
                            mediaItems: MutableList<MediaItem>,
                            startIndex: Int,
                            startPositionMs: Long
                    ): ListenableFuture<*> {
                        recordPosition(player, EVENT_TYPE_BOOK_CHANGE)
                        return super.handleSetMediaItems(mediaItems, startIndex, startPositionMs)
                    }
                }

        mediaSession = MediaSession.Builder(this, forwardingPlayer).build()
    }

    @OptIn(UnstableApi::class)
    private fun recordPosition(player: Player, eventType: Int) {
        if (player.mediaItemCount > 0 && player.mediaItemCount >= player.currentMediaItemIndex) {
            val eventTime = Clock.DEFAULT.currentTimeMillis()

            val currentMediaItem = player.getMediaItemAt(player.currentMediaItemIndex)
            val instanceId = currentMediaItem.mediaMetadata.extras!!.getString("instanceId")!!
            val bookId = currentMediaItem.mediaMetadata.extras!!.getLong("bookId")

            var absolutePositionMs = player.currentPosition
            val window = Timeline.Window()
            for (i in 0 until player.currentMediaItemIndex) {
                player.currentTimeline.getWindow(i, window)
                absolutePositionMs +=
                        if (window.durationMs == C.TIME_UNSET) {
                            window.mediaItem.clippingConfiguration.endPositionMs -
                                    window.mediaItem.clippingConfiguration.startPositionMs
                        } else window.durationMs
            }

            val event =
                    PlaybackHistory(
                            id = null,
                            bookId = bookId,
                            type = eventType,
                            positionMs = absolutePositionMs,
                            eventTimestampMs = eventTime
                    )

            serviceScope.launch {
                val db = PlaybackHistoryDatabase.getDatabase(applicationContext, instanceId)
                db.playbackHistoryDao().insert(event)
            }
        }
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        playbackHistoryJob.cancel()
        super.onDestroy()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }
}
