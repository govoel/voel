package expo.modules.voel.audio

import android.os.Build
import android.os.Bundle
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
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSession.ConnectionResult
import androidx.media3.session.MediaSession.ConnectionResult.AcceptedResultBuilder
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CompletableJob
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

const val AUDIO_SESSION_COMMAND_STOP_PLAYBACK = "STOP_PLAYBACK"
const val AUDIO_SESSION_COMMAND_SET_PLAYBACK_SPEED = "SET_PLAYBACK_SPEED"

@UnstableApi
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
          .setCache(AudioSingletonHolder.getDownloadSimpleCache(this))
          .setCacheWriteDataSinkFactory(null)
          .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
          .setUpstreamDataSourceFactory(
            CacheDataSource.Factory()
              .setCache(AudioSingletonHolder.getStreamSimpleCache(this))
              .setUpstreamDataSourceFactory(
                OkHttpDataSource.Factory(AudioSingletonHolder.httpClient)
              )
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
          true,
        )
        .build()

    val forwardingPlayer =
      object : ForwardingSimpleBasePlayer(exoPlayer) {
        override fun handleAddMediaItems(
          index: Int,
          mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<*> {
          exoPlayer.addMediaSources(index, createMediaSources(mediaItems))
          return Futures.immediateVoidFuture()
        }

        override fun handleSetMediaItems(
          mediaItems: MutableList<MediaItem>,
          startIndex: Int,
          startPositionMs: Long,
        ): ListenableFuture<*> {
          val mediaSources = createMediaSources(mediaItems)
          recordPosition(player, EVENT_TYPE_BOOK_CHANGE)
          exoPlayer.setMediaSources(mediaSources, startIndex, startPositionMs)
          return Futures.immediateVoidFuture()
        }

        override fun handleSeek(
          mediaItemIndex: Int,
          positionMs: Long,
          seekCommand: Int,
        ): ListenableFuture<*> {
          recordPosition(player, EVENT_TYPE_SEEK_START)
          val superReturn = super.handleSeek(mediaItemIndex, positionMs, seekCommand)
          recordPosition(player, EVENT_TYPE_SEEK_END)
          return superReturn
        }

        override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
          val superReturn = super.handleSetPlayWhenReady(playWhenReady)
          recordPosition(player, if (playWhenReady) EVENT_TYPE_PLAY else EVENT_TYPE_PAUSE)
          return superReturn
        }

        override fun handleRelease(): ListenableFuture<*> {
          recordPosition(player, EVENT_TYPE_SESSION_END)
          return super.handleRelease()
        }

        override fun handleStop(): ListenableFuture<*> {
          recordPosition(player, EVENT_TYPE_SESSION_END)
          return super.handleStop()
        }
      }

    mediaSession =
      MediaSession.Builder(this, forwardingPlayer)
        .setMediaButtonPreferences(
          ImmutableList.of(getPlaybackSpeedButton(exoPlayer.playbackParameters.speed), stopButton)
        )
        .setCallback(CustomMediaSessionCallback())
        .build()
  }

  companion object {
    val stopButton =
      CommandButton.Builder(CommandButton.ICON_STOP)
        .setDisplayName("Stop Playback")
        .setSessionCommand(SessionCommand(AUDIO_SESSION_COMMAND_STOP_PLAYBACK, Bundle.EMPTY))
        .setSlots(CommandButton.SLOT_BACK_SECONDARY, CommandButton.SLOT_OVERFLOW)
        .build()
  }

  private fun getPlaybackSpeedButton(speed: Float): CommandButton {
    val playbackSpeedIcon =
      if (speed < 0.6f) {
        CommandButton.ICON_PLAYBACK_SPEED_0_5
      } else if (speed < 0.9f) {
        CommandButton.ICON_PLAYBACK_SPEED_0_8
      } else if (speed < 1.1f) {
        CommandButton.ICON_PLAYBACK_SPEED_1_0
      } else if (speed < 1.3f) {
        CommandButton.ICON_PLAYBACK_SPEED_1_2
      } else if (speed < 1.6f) {
        CommandButton.ICON_PLAYBACK_SPEED_1_5
      } else if (speed < 1.9f) {
        CommandButton.ICON_PLAYBACK_SPEED_1_8
      } else if (speed < 2.1f) {
        CommandButton.ICON_PLAYBACK_SPEED_2_0
      } else {
        CommandButton.ICON_PLAYBACK_SPEED
      }

    return CommandButton.Builder(playbackSpeedIcon)
      .setDisplayName("Playback Speed")
      .setSessionCommand(SessionCommand(AUDIO_SESSION_COMMAND_SET_PLAYBACK_SPEED, Bundle.EMPTY))
      .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
      .build()
  }

  private inner class CustomMediaSessionCallback : MediaSession.Callback {
    @OptIn(UnstableApi::class)
    override fun onConnect(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
    ): MediaSession.ConnectionResult {
      return AcceptedResultBuilder(session)
        .setAvailableSessionCommands(
          ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
            .add(SessionCommand(AUDIO_SESSION_COMMAND_STOP_PLAYBACK, Bundle.EMPTY))
            .add(SessionCommand(AUDIO_SESSION_COMMAND_SET_PLAYBACK_SPEED, Bundle.EMPTY))
            .build()
        )
        .build()
    }

    @OptIn(UnstableApi::class)
    override fun onCustomCommand(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      customCommand: SessionCommand,
      args: Bundle,
    ): ListenableFuture<SessionResult> {
      if (
        customCommand.customAction == AUDIO_SESSION_COMMAND_STOP_PLAYBACK &&
          session.player.availableCommands.contains(Player.COMMAND_STOP) &&
          session.player.availableCommands.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS)
      ) {
        session.player.stop()
        session.player.clearMediaItems()
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      } else if (
        customCommand.customAction == AUDIO_SESSION_COMMAND_SET_PLAYBACK_SPEED &&
          session.player.availableCommands.contains(Player.COMMAND_SET_SPEED_AND_PITCH)
      ) {
        // don't use exact values to avoid floating point precision issues
        if (session.player.playbackParameters.speed < 0.6f) {
          session.player.setPlaybackSpeed(0.8f)
        } else if (session.player.playbackParameters.speed < 0.9f) {
          session.player.setPlaybackSpeed(1.0f)
        } else if (session.player.playbackParameters.speed < 1.1f) {
          session.player.setPlaybackSpeed(1.2f)
        } else if (session.player.playbackParameters.speed < 1.3f) {
          session.player.setPlaybackSpeed(1.5f)
        } else if (session.player.playbackParameters.speed < 1.6f) {
          session.player.setPlaybackSpeed(1.8f)
        } else if (session.player.playbackParameters.speed < 1.9f) {
          session.player.setPlaybackSpeed(2.0f)
        } else if (session.player.playbackParameters.speed < 2.1f) {
          session.player.setPlaybackSpeed(0.5f)
        } else {
          session.player.setPlaybackSpeed(1.0f)
        }

        session.setMediaButtonPreferences(
          ImmutableList.of(
            getPlaybackSpeedButton(session.player.playbackParameters.speed),
            stopButton,
          )
        )
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
      return super.onCustomCommand(session, controller, customCommand, args)
    }
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
        val instanceId = mediaItem.mediaMetadata.extras!!.getString("instanceId")
        ConcatenatingMediaSource2.Builder()
          .apply {
            files.mapIndexed { index, file ->
              val concatMediaSource =
                mediaSourceFactory.createMediaSource(
                  MediaItem.Builder()
                    .setUri(file.uri.toUri())
                    .setCustomCacheKey("${instanceId}-${file.id}")
                    .build()
                )

              if (index == 0 || index == files.size - 1) {
                val clipStartPositionMs =
                  if (index == 0) mediaItem.clippingConfiguration.startPositionMs else 0
                val clipEndPositionMs =
                  if (index == 0) file.durationMs
                  else
                    mediaItem.clippingConfiguration.endPositionMs -
                      (files.sumOf { it.durationMs } - files.last().durationMs)

                add(
                  ClippingMediaSource.Builder(concatMediaSource)
                    .setStartPositionMs(clipStartPositionMs)
                    .setEndPositionMs(clipEndPositionMs)
                    .build(),
                  clipEndPositionMs - clipStartPositionMs,
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
          eventTimestampMs = eventTime,
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
