package expo.modules.voel.audio

import androidx.media3.common.C
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.math.min

class VoelAudioModule : Module() {
  lateinit var player: VoelAudioPlayer

  private lateinit var lastPlaybackHistoryEvent: Map<String, Any>
  private var currentPlaybackHistoryUpdateInstanceID: String? = null
  private var playbackHistoryUpdateJob: Job? = null

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

    Events("playbackStatusUpdate", "playbackHistoryUpdate")

    Property("isBuffering") {
      runOnMain { player.controller.playbackState == Player.STATE_BUFFERING }
    }

    Property("currentState") { player.currentStatus() }

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

    Function("lastPlaybackHistoryEvent") {instanceID: String ->
      if (::lastPlaybackHistoryEvent.isInitialized && lastPlaybackHistoryEvent["instanceID"] == instanceID) {
        lastPlaybackHistoryEvent
      } else {
        mapOf(
          "instanceID" to instanceID,
          "events" to emptyArray<Map<String, Any>>()
        )
      }
    }

    Function("startPlaybackHistoryUpdates") { instanceID: String ->
      if (currentPlaybackHistoryUpdateInstanceID != instanceID) {
        playbackHistoryUpdateJob?.cancel()
        val db =
          PlaybackHistoryDatabase.getDatabase(
            appContext.throwingActivity.applicationContext,
            instanceID
          )

        playbackHistoryUpdateJob =
          appContext.mainQueue.launch {
            db.playbackHistoryDao().getAll().collect { events ->
              lastPlaybackHistoryEvent = mapOf(
                "instanceID" to instanceID,
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
                "playbackHistoryUpdate",
                lastPlaybackHistoryEvent
              )
            }
          }
        currentPlaybackHistoryUpdateInstanceID = instanceID
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
      runOnMain { VoelAudioPlaybackService.setCookie(cookie) }
    }

    Function("replace") { sources: List<AudioSource> ->
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS)
        ) {
          if (sources.isNotEmpty()) {
            player.setAudioSources(sources)
          }
        }
      }
    }

    Function("setQueue") { sources: List<AudioSource> ->
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS)
        ) {
          //                    val wasPlaying = player.controller.isPlaying
          if (sources.isNotEmpty()) {
            //                        player.controller.clearMediaItems()
            player.setAudioSources(sources)
            //                        if (wasPlaying) {
            //                            player.controller.play()
            //                        }
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
              fileIds =
                mediaItem.mediaMetadata.extras!!.getLongArray("fileIds")!!,
              chapterId = mediaItem.mediaMetadata.extras!!.getLong("chapterId"),
              bookTitle = mediaItem.mediaMetadata.albumTitle!!.toString(),
              chapterTitle = mediaItem.mediaMetadata.title!!.toString(),
              author = mediaItem.mediaMetadata.artist!!.toString(),
              fileUris =
                mediaItem.mediaMetadata.extras!!.getStringArrayList(
                  "fileUris"
                )!!,
              fileDurations =
                mediaItem.mediaMetadata.extras!!.getLongArray(
                  "fileDurations"
                )!!,
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

    Function("getCurrentQueueIndex") {
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_GET_TIMELINE)) {
          player.controller.currentMediaItemIndex
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

    Function("skipToQueueIndex") { index: Int ->
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_SEEK_TO_MEDIA_ITEM)
        ) {
          if (index >= 0 && index < player.controller.mediaItemCount) {
            player.controller.seekTo(index, 0)
          }
        }
      }
    }

    Function("seekTo") { mediaItemIndex: Int, positionMs: Long ->
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_SEEK_TO_MEDIA_ITEM)
        ) {
          if (mediaItemIndex >= 0 && mediaItemIndex < player.controller.mediaItemCount) {
            player.controller.seekTo(mediaItemIndex, positionMs)
          }
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
  }

  private fun <T> runOnMain(block: () -> T): T =
    runBlocking(appContext.mainQueue.coroutineContext) { block() }
}
