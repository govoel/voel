package expo.modules.voel.audio

import android.os.Build
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
import androidx.media3.datasource.cache.CacheDataSource
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
import kotlinx.coroutines.CompletableJob
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

const val AUDIO_FILES_DOWNLOAD_PATH = "VoelAudioDownloadCache"
const val AUDIO_CACHE_STREAM_PATH = "VoelAudioStreamCache"

class VoelAudioPlaybackService : MediaSessionService() {
  private lateinit var mediaSourceFactory: DefaultMediaSourceFactory
  lateinit var exoPlayer: ExoPlayer
  private var mediaSession: MediaSession? = null
  private lateinit var playbackHistoryJob: CompletableJob
  private lateinit var serviceScope: CoroutineScope

  @OptIn(UnstableApi::class)
  override fun onCreate() {
    super.onCreate()

    playbackHistoryJob = SupervisorJob()
    serviceScope = CoroutineScope(Dispatchers.IO + playbackHistoryJob)

    setMediaNotificationProvider(
      DefaultMediaNotificationProvider.Builder(this).build().apply {
        setSmallIcon(R.drawable.voel_logo)
      }
    )

    mediaSourceFactory =
      DefaultMediaSourceFactory(
        CacheDataSource.Factory()
          .setCache(
            AudioSingletonHolder.getDownloadSimpleCache(this)
          )
          .setCacheWriteDataSinkFactory(null)
          .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
          .setUpstreamDataSourceFactory(
            CacheDataSource.Factory()
              .setCache(
                AudioSingletonHolder.getStreamSimpleCache(this)
              )
              .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(AudioSingletonHolder.httpClient))
              .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
          )
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
      val files =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          mediaItem.mediaMetadata.extras!!.getParcelableArray("files", AudioFile::class.java)!!
        } else {
          @Suppress("UNCHECKED_CAST")
          mediaItem.mediaMetadata.extras!!.getParcelableArray("files")!! as Array<AudioFile>
        }

      if (files.size < 2) {
        mediaSourceFactory.createMediaSource(mediaItem)
      } else {
        val instanceId =
          mediaItem.mediaMetadata.extras!!.getString("instanceId")
        ConcatenatingMediaSource2.Builder()
          .apply {
            files.mapIndexed { index, file ->
              val concatMediaSource =
                mediaSourceFactory.createMediaSource(
                  MediaItem.Builder()
                    .setUri(file.uri.toUri())
                    .setCustomCacheKey(
                      "${instanceId}-${file.id}"
                    )
                    .build()
                )

              if (index == 0 || index == files.size - 1) {
                val clipStartPositionMs =
                  if (index == 0)
                    mediaItem.clippingConfiguration.startPositionMs
                  else 0
                val clipEndPositionMs =
                  if (index == 0) file.durationMs
                  else mediaItem.clippingConfiguration.endPositionMs - (files.sumOf { it.durationMs } - files.last().durationMs)

                add(
                  ClippingMediaSource.Builder(concatMediaSource)
                    .setStartPositionMs(clipStartPositionMs)
                    .setEndPositionMs(clipEndPositionMs)
                    .build(),
                  clipEndPositionMs - clipStartPositionMs
                )
              } else {
                add(concatMediaSource, file.durationMs)
              }
            }

            setMediaItem(mediaItem)
          }
          .build()
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
