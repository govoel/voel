package expo.modules.voel.audio

import android.os.Build
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.math.min

const val AUDIO_EVENT_PLAYBACK_STATUS_UPDATE = "playbackStatusUpdate"
const val AUDIO_EVENT_PLAYBACK_HISTORY_UPDATE = "playbackHistoryUpdate"

class VoelAudioModule : Module() {
  private lateinit var player: VoelAudioPlayer

  private lateinit var lastPlaybackHistoryEvent: Map<String, Any>
  private var currentPlaybackHistoryUpdateInstanceId: String? = null
  private var playbackHistoryUpdateJob: Job? = null

  @OptIn(UnstableApi::class)
  override fun definition() = ModuleDefinition {
    Name("VoelAudio")

    OnCreate {
      runOnMain {
        player =
          VoelAudioPlayer(
            appContext.throwingActivity.applicationContext,
            appContext,
            300.toDouble(),
            this@VoelAudioModule::sendEvent
          )
      }
    }

    OnDestroy { runOnMain { playbackHistoryUpdateJob?.cancel() } }

    Events(AUDIO_EVENT_PLAYBACK_STATUS_UPDATE, AUDIO_EVENT_PLAYBACK_HISTORY_UPDATE)

    Property("isBuffering") {
      runOnMain { player.controller.playbackState == Player.STATE_BUFFERING }
    }

    Property("currentStatus") { runOnMain { player.currentStatus() } }

    Property("isLoaded") { runOnMain { player.controller.playbackState == Player.STATE_READY } }

    Property("playing") { runOnMain { player.controller.isPlaying } }

    Property("muted") { player.isMuted }.set { value: Boolean? ->
      val newMuted = value ?: false
      player.isMuted = newMuted
      player.controller.setVolume(if (newMuted) 0f else player.previousVolume)
    }

    Property("shouldCorrectPitch") { player.preservesPitch }.set { value: Boolean ->
      player.preservesPitch = value
    }

    Property("currentTime") { runOnMain { player.currentTime } }

    Property("duration") { runOnMain { player.duration } }

    Property("playbackRate") { runOnMain { player.controller.playbackParameters.speed } }

    Property("volume") { runOnMain { player.controller.volume } }.set { value: Float? ->
      player.setVolume(value)
    }

    Function("getLastPlaybackHistoryEvent") { instanceId: String ->
      if (::lastPlaybackHistoryEvent.isInitialized &&
        lastPlaybackHistoryEvent["instanceId"] == instanceId
      ) {
        lastPlaybackHistoryEvent
      } else {
        mapOf("instanceId" to instanceId, "events" to emptyArray<Map<String, Any>>())
      }
    }

    Function("startPlaybackHistoryUpdates") { instanceId: String ->
      if (currentPlaybackHistoryUpdateInstanceId != instanceId) {
        playbackHistoryUpdateJob?.cancel()
        val db =
          PlaybackHistoryDatabase.getDatabase(
            appContext.throwingActivity.applicationContext,
            instanceId
          )

        playbackHistoryUpdateJob =
          appContext.mainQueue.launch {
            db.playbackHistoryDao().getAll().collect { events ->
              lastPlaybackHistoryEvent =
                mapOf(
                  "instanceId" to instanceId,
                  "events" to
                      events.map { event ->
                        mapOf(
                          "id" to event.id,
                          "type" to event.type,
                          "bookId" to event.bookId,
                          "positionMs" to
                              event.positionMs,
                          "eventTimestampMs" to
                              event.eventTimestampMs
                        )
                      }
                )
              sendEvent(
                AUDIO_EVENT_PLAYBACK_HISTORY_UPDATE,
                lastPlaybackHistoryEvent
              )
            }
          }
        currentPlaybackHistoryUpdateInstanceId = instanceId
      }
    }

    AsyncFunction("deletePlaybackHistoryOlderThan") Coroutine
        { instanceId: String, timestamp: Long ->
          val db =
            PlaybackHistoryDatabase.getDatabase(
              appContext.throwingActivity.applicationContext,
              instanceId
            )
          return@Coroutine db.playbackHistoryDao().deleteEventsOlderThan(timestamp)
        }

    Function("play") {
      runOnMain { if (!player.controller.isPlaying) player.controller.play() }
    }

    Function("pause") { runOnMain { player.controller.pause() } }

    Function("setCookie") { cookie: String ->
      runOnMain { AudioSingletonHolder.setCookie(cookie) }
    }

    Function("replace") { sources: List<AudioSource>, startIndex: Int, startPositionMs: Long ->
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS)
        ) {
          if (sources.isNotEmpty()) {
            player.setAudioSources(sources, startIndex, startPositionMs)
            if (!player.controller.isPlaying) {
              player.controller.play()
            }
          }
        }
      }
    }

    Function("getCurrentQueue") {
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_GET_TIMELINE)) {
          val mediaItems = player.getCurrentQueue()

          mediaItems.map { mediaItem ->
            AudioSource(
              instanceId =
                mediaItem.mediaMetadata.extras!!.getString("instanceId"),
              bookId = mediaItem.mediaMetadata.extras!!.getLong("bookId"),
              chapterId = mediaItem.mediaMetadata.extras!!.getLong("chapterId"),
              bookTitle = mediaItem.mediaMetadata.albumTitle!!.toString(),
              chapterTitle = mediaItem.mediaMetadata.title!!.toString(),
              author = mediaItem.mediaMetadata.artist!!.toString(),
              files =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                  mediaItem.mediaMetadata.extras!!.getParcelableArray(
                    "files",
                    AudioFile::class.java
                  )!!
                else {
                  @Suppress("UNCHECKED_CAST")
                  mediaItem.mediaMetadata.extras!!.getParcelableArray(
                    "files"
                  )!! as
                      Array<AudioFile>
                },
              artworkUri = mediaItem.mediaMetadata.artworkUri?.toString(),
              startTimeMs = mediaItem.clippingConfiguration.startPositionMs,
              endTimeMs =
                if (mediaItem.clippingConfiguration.endPositionMs ==
                  C.TIME_END_OF_SOURCE
                )
                  null
                else mediaItem.clippingConfiguration.endPositionMs
            )
          }
        } else {
          emptyList()
        }
      }
    }

    Function("clearQueue") {
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS)
        ) {
          player.controller.clearMediaItems()
          player.controller.stop()
        }
      }
    }

    Function("canSkipToNext") {
      runOnMain {
        if (player.controller.isCommandAvailable(Player.COMMAND_GET_TIMELINE)) {
          player.controller.hasNextMediaItem()
        } else {
          false
        }
      }
    }

    Function("canSkipToPrevious") {
      runOnMain {
        if (player.controller.isCommandAvailable(Player.COMMAND_GET_TIMELINE)) {
          player.controller.hasPreviousMediaItem()
        } else {
          false
        }
      }
    }

    Function("skipToNext") {
      runOnMain {
        if (player.controller.availableCommands.contains(
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM
          )
        ) {
          player.controller.seekToNextMediaItem()
        }
      }
    }

    Function("skipToPrevious") {
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_SEEK_TO_PREVIOUS)) {
          player.controller.seekToPreviousMediaItem()
        }
      }
    }

    Function("setPlaybackRate") { rate: Float ->
      appContext.mainQueue.launch {
        val playbackRate = if (rate < 0) 0f else min(rate, 2.0f)
        val pitch = if (player.preservesPitch) 1f else playbackRate
        player.controller.playbackParameters = PlaybackParameters(playbackRate, pitch)
      }
    }

    Function("addDownloads") { instanceId: String, files: List<AudioDownload> ->
      files.map { file ->
        DownloadService.sendAddDownload(
          appContext.throwingActivity.applicationContext,
          VoelAudioDownloadService::class.java,
          DownloadRequest.Builder("${instanceId}-${file.id}", file.uri.toUri())
            .setCustomCacheKey("${instanceId}-${file.id}")
            .setData(file.filePath.encodeToByteArray())
            .build(),
          false
        )
      }
    }

    Function("removeDownloads") { instanceId: String, fileIds: LongArray ->
      fileIds.map { fileId ->
        DownloadService.sendRemoveDownload(
          appContext.throwingActivity.applicationContext,
          VoelAudioDownloadService::class.java,
          "${instanceId}-${fileId}",
          false
        )
      }
    }
  }

  private fun <T> runOnMain(block: () -> T): T =
    runBlocking(appContext.mainQueue.coroutineContext) { block() }
}
