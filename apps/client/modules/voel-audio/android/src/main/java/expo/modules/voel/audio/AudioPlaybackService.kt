package expo.modules.voel.audio

import androidx.annotation.OptIn
import androidx.core.net.toUri
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
import androidx.media3.exoplayer.source.ClippingMediaSource
import androidx.media3.exoplayer.source.ConcatenatingMediaSource2
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.io.File

class VoelAudioPlaybackService : MediaSessionService() {
  lateinit var mediaSourceFactory: DefaultMediaSourceFactory
  lateinit var exoPlayer: ExoPlayer
  var mediaSession: MediaSession? = null
  private val playbackHistoryJob = SupervisorJob()
  private val serviceScope = CoroutineScope(Dispatchers.IO + playbackHistoryJob)

  companion object {
    @Volatile
    private var cookie: String? = null

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

    mediaSourceFactory =
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
          .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(httpClient))
          .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
      )

    exoPlayer =
      ExoPlayer.Builder(this)
        .setMediaSourceFactory(mediaSourceFactory)
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
      object : ForwardingSimpleBasePlayer(exoPlayer) {
        override fun handleAddMediaItems(
          index: Int,
          mediaItems: MutableList<MediaItem>
        ): ListenableFuture<*> {
          exoPlayer.addMediaSources(index, createMediaSources(mediaItems))
          return Futures.immediateVoidFuture()
        }

        override fun handleSetMediaItems(
          mediaItems: MutableList<MediaItem>,
          startIndex: Int,
          startPositionMs: Long
        ): ListenableFuture<*> {
          val mediaSources = createMediaSources(mediaItems)
          recordPosition(player, EVENT_TYPE_BOOK_CHANGE)
          exoPlayer.setMediaSources(mediaSources, startIndex, startPositionMs)
          return Futures.immediateVoidFuture()
        }

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
      }

    mediaSession = MediaSession.Builder(this, forwardingPlayer).build()
  }

  @OptIn(UnstableApi::class)
  private fun createMediaSources(mediaItems: MutableList<MediaItem>): List<MediaSource> {
    return mediaItems.map { mediaItem ->
      val fileUris =
        mediaItem.mediaMetadata.extras!!.getStringArrayList(
          "fileUris"
        )!!

      if (fileUris.size < 2) {
        mediaSourceFactory.createMediaSource(mediaItem)
      } else {
        val instanceId = mediaItem.mediaMetadata.extras!!.getString("instanceId")
        val fileDurations = mediaItem.mediaMetadata.extras!!.getLongArray("fileDurations")!!

        ConcatenatingMediaSource2.Builder().apply {
          fileUris.mapIndexed { index, fileUri ->
            val concatMediaSource = mediaSourceFactory.createMediaSource(
              MediaItem.Builder().setUri(fileUri.toUri())
                .setCustomCacheKey("${instanceId}_${fileUri}").build()
            )

            if (index == 0 || index == fileUris.size - 1) {
              val clipStartPositionMs =
                if (index == 0) mediaItem.clippingConfiguration.startPositionMs else 0
              val clipEndPositionMs =
                if (index == 0) fileDurations[0] else mediaItem.clippingConfiguration.endPositionMs - (fileDurations.sum() - fileDurations.last())

              add(
                ClippingMediaSource.Builder(concatMediaSource)
                  .setStartPositionMs(clipStartPositionMs)
                  .setEndPositionMs(clipEndPositionMs)
                  .build(),
                clipEndPositionMs - clipStartPositionMs
              )
            } else {
              add(concatMediaSource, fileDurations[index])
            }
          }

          setMediaItem(mediaItem)
        }.build()
      }
    }
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
