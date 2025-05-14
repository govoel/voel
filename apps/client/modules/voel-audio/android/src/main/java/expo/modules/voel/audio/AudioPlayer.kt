package expo.modules.voel.audio

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.sharedobjects.SharedObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class VoelAudioPlayer(
  val context: Context,
  appContext: AppContext,
  private val updateInterval: Double,
  private val emitEvent: (String, Map<String, Any?>) -> Unit
) : AutoCloseable, SharedObject(appContext) {
  var preservesPitch = true
  var isPaused = false
  var isMuted = false
  var previousVolume = 1f

  private var controllerFuture: ListenableFuture<MediaController>
  lateinit var controller: MediaController

  private var playing = false
  private var playerScope = CoroutineScope(Dispatchers.Default)
  private var updateJob: Job? = null

  val currentTime
    get() = controller.currentPosition / 1000f
  val duration
    get() = if (controller.duration != C.TIME_UNSET) controller.duration / 1000f else 0L

  init {
    appContext.reactContext.apply {
      val intent = Intent(context, VoelAudioPlaybackService::class.java)
      intent.action = MediaSessionService.SERVICE_INTERFACE
      context.startService(intent)
    }

    val sessionToken =
      SessionToken(context, ComponentName(context, VoelAudioPlaybackService::class.java))

    controllerFuture = MediaController.Builder(context, sessionToken).buildAsync()
    controllerFuture.addListener(
      {
        controller = controllerFuture.get()
        addPlayerListeners()
        startUpdating()
      },
      MoreExecutors.directExecutor()
    )
  }

  override fun close() {
    updateJob?.cancel()
    MediaController.releaseFuture(controllerFuture)
  }

  fun getCurrentQueue(): List<MediaItem> {
    return (0 until controller.mediaItemCount).mapNotNull { index ->
      controller.getMediaItemAt(index)
    }
  }

  fun removeFromQueue(mediaItems: List<MediaItem>) {
    val urisToRemove = mediaItems.mapNotNull { it.localConfiguration?.uri?.toString() }.toSet()

    val indicesToRemove = mutableListOf<Int>()

    for (i in 0 until controller.mediaItemCount) {
      val uri = controller.getMediaItemAt(i).localConfiguration?.uri?.toString() ?: continue
      if (uri in urisToRemove) {
        indicesToRemove.add(i)
      }
    }

    // Remove items from the end to avoid index shifting
    for (index in indicesToRemove.sortedDescending()) {
      controller.removeMediaItem(index)
    }

    if (controller.mediaItemCount == 0) {
      controller.stop()
    }
  }

  fun setAudioSources(audioSources: List<AudioSource>) {
    val mediaSources = createMediaItems(audioSources)
    controller.setMediaItems(mediaSources)
    controller.prepare()
  }

  fun createMediaItems(sources: List<AudioSource>): List<MediaItem> {
    return sources.map { source -> createMediaItem(source) }
  }

  @OptIn(UnstableApi::class)
  private fun createMediaItem(source: AudioSource): MediaItem {
    return MediaItem.Builder()
      .apply {
        if (source.fileUris.size == 1) {
          setUri(source.fileUris[0].toUri())
          setCustomCacheKey("${source.instanceId}_${source.fileUris[0]}")
        } else {
          setUri(Uri.EMPTY)
        }
      }
      .setMediaMetadata(
        MediaMetadata.Builder()
          .setTitle(source.chapterTitle)
          .setAlbumTitle(source.bookTitle)
          .setArtist(source.author)
          .setSubtitle(source.bookTitle)
          .setArtworkUri(source.artworkUri?.toUri())
          .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK_CHAPTER)
          .setExtras(
            Bundle().apply {
              putString("instanceId", source.instanceId)
              putLong("bookId", source.bookId)
              putLong("chapterId", source.chapterId)
              putLongArray("fileIds", source.fileIds)
              putStringArrayList("fileUris", source.fileUris)
              putLongArray("fileDurations", source.fileDurations)
            }
          )
          .build()
      )
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(source.startTimeMs)
          .setEndPositionMs(source.endTimeMs ?: C.TIME_END_OF_SOURCE)
          .build()
      )
      .build()
  }

  private suspend fun sendPlayerUpdate(map: Map<String, Any?>? = null) =
    withContext(Dispatchers.Main) {
      val data = currentStatus()
      val body = map?.let { data + it } ?: data
      emitEvent("playbackStatusUpdate", body)
    }

  fun startUpdating() {
    updateJob?.cancel()
    updateJob =
      flow {
        while (true) {
          emit(Unit)
          delay(updateInterval.toLong())
        }
      }
        .onEach { sendPlayerUpdate() }
        .launchIn(playerScope)
  }

  private fun addPlayerListeners() =
    controller.addListener(
      object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
          playing = isPlaying
          playerScope.launch { sendPlayerUpdate(mapOf("playing" to isPlaying)) }
        }

        override fun onIsLoadingChanged(isLoading: Boolean) {
          playerScope.launch { sendPlayerUpdate(mapOf("isLoaded" to isLoading)) }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
          playerScope.launch {
            sendPlayerUpdate(
              mapOf(
                "playbackState" to
                    playbackStateToString(playbackState)
              )
            )
          }
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
          playerScope.launch { sendPlayerUpdate() }
        }
      }
    )

  private fun playbackStateToString(state: Int): String {
    return when (state) {
      Player.STATE_READY -> "ready"
      Player.STATE_BUFFERING -> "buffering"
      Player.STATE_IDLE -> "idle"
      Player.STATE_ENDED -> "ended"
      else -> "unknown"
    }
  }

  fun setVolume(volume: Float?) {
    val boundedVolume = volume?.coerceIn(0f, 1f) ?: 1f
    if (isMuted) {
      if (boundedVolume > 0f) {
        previousVolume = boundedVolume
      }
      controller.volume = 0f
    } else {
      controller.volume = if (boundedVolume > 0f) boundedVolume else previousVolume
    }
  }

  fun currentStatus(): Map<String, Any?> {
    val isMuted = controller.volume == 0f
    val isLooping = controller.repeatMode == Player.REPEAT_MODE_ONE
    val isLoaded = controller.playbackState == Player.STATE_READY
    val isBuffering = controller.playbackState == Player.STATE_BUFFERING

    return mapOf(
      "currentTime" to currentTime,
      "playbackState" to playbackStateToString(controller.playbackState),
      "timeControlStatus" to if (controller.isPlaying) "playing" else "paused",
      "reasonForWaitingToPlay" to null,
      "mute" to isMuted,
      "duration" to duration,
      "currentQueueIndex" to controller.currentMediaItemIndex,
      "playing" to controller.isPlaying,
      "loop" to isLooping,
      "didJustFinish" to (controller.playbackState == Player.STATE_ENDED),
      "isLoaded" to
          if (controller.playbackState == Player.STATE_ENDED) true else isLoaded,
      "playbackRate" to controller.playbackParameters.speed,
      "shouldCorrectPitch" to preservesPitch,
      "isBuffering" to isBuffering,
      "errorCode" to controller.getPlayerError()?.errorCode
    )
  }
}
