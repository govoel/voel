package expo.modules.voel.audio

import android.Manifest
import android.os.Build
import androidx.annotation.OptIn
import androidx.core.app.NotificationManagerCompat
import androidx.core.net.toUri
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import expo.modules.core.utilities.ifNull
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.min
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

const val AUDIO_EVENT_PLAYBACK_STATUS_UPDATE = "playbackStatusUpdate"
const val AUDIO_EVENT_PLAYBACK_HISTORY_UPDATE = "playbackHistoryUpdate"
const val AUDIO_EVENT_DOWNLOAD_STATUS_UPDATE = "downloadStatusUpdate"

@UnstableApi
class VoelAudioModule : Module() {
  private lateinit var player: VoelAudioPlayer

  private lateinit var lastPlaybackHistoryEvent: Map<String, Any>
  private var currentPlaybackHistoryUpdateInstanceId: String? = null
  private var playbackHistoryUpdateJob: Job? = null

  private var downloadManagerListener: DownloadManager.Listener? = null
  private val downloadUpdateLock = Any()
  private var downloadUpdatesStarted: Boolean = false
  private var downloadUpdateEvents = mutableSetOf<Map<String, Any>>()
  private var downloadUpdateJob: Job? = null
  private val downloadUpdateJobScope: CoroutineScope = CoroutineScope(Dispatchers.Main)

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
            this@VoelAudioModule::sendEvent,
          )
      }
    }

    OnDestroy {
      runOnMain {
        playbackHistoryUpdateJob?.cancel()
        downloadUpdateJob?.cancel()

        downloadManagerListener?.let { listener ->
          AudioSingletonHolder.getDownloadManager(appContext.throwingActivity.applicationContext)
            .removeListener(listener)
        }
      }
    }

    Events(
      AUDIO_EVENT_PLAYBACK_STATUS_UPDATE,
      AUDIO_EVENT_PLAYBACK_HISTORY_UPDATE,
      AUDIO_EVENT_DOWNLOAD_STATUS_UPDATE,
    )

    Property("isBuffering") {
      runOnMain { player.controller.playbackState == Player.STATE_BUFFERING }
    }

    Property("currentStatus") { runOnMain { player.currentStatus() } }

    Property("isLoaded") { runOnMain { player.controller.playbackState == Player.STATE_READY } }

    Property("playing") { runOnMain { player.controller.isPlaying } }

    Property("muted") { player.isMuted }
      .set { value: Boolean? ->
        val newMuted = value ?: false
        player.isMuted = newMuted
        player.controller.setVolume(if (newMuted) 0f else player.previousVolume)
      }

    Property("shouldCorrectPitch") { player.preservesPitch }
      .set { value: Boolean -> player.preservesPitch = value }

    Property("currentTime") { runOnMain { player.currentTime } }

    Property("duration") { runOnMain { player.duration } }

    Property("playbackRate") { runOnMain { player.controller.playbackParameters.speed } }

    Property("volume") { runOnMain { player.controller.volume } }
      .set { value: Float? -> player.setVolume(value) }

    Function("getLastPlaybackHistoryEvent") { instanceId: String ->
      if (
        ::lastPlaybackHistoryEvent.isInitialized &&
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
            instanceId,
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
                        "positionMs" to event.positionMs,
                        "eventTimestampMs" to event.eventTimestampMs,
                        "sessionId" to event.sessionId,
                      )
                    },
                )
              sendEvent(AUDIO_EVENT_PLAYBACK_HISTORY_UPDATE, lastPlaybackHistoryEvent)
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
            instanceId,
          )
        return@Coroutine db.playbackHistoryDao().deleteEventsOlderThan(timestamp)
      }

    Function("play") { runOnMain { if (!player.controller.isPlaying) player.controller.play() } }

    Function("pause") { runOnMain { player.controller.pause() } }

    Function("setCookie") { cookie: String -> runOnMain { AudioSingletonHolder.setCookie(cookie) } }

    AsyncFunction("replace") { sources: List<AudioSource>, startIndex: Int, startPositionMs: Long ->
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS)) {
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
              instanceId = mediaItem.mediaMetadata.extras!!.getString("instanceId"),
              bookId = mediaItem.mediaMetadata.extras!!.getLong("bookId"),
              chapterId = mediaItem.mediaMetadata.extras!!.getLong("chapterId"),
              bookTitle = mediaItem.mediaMetadata.albumTitle!!.toString(),
              chapterTitle = mediaItem.mediaMetadata.title!!.toString(),
              author = mediaItem.mediaMetadata.artist!!.toString(),
              files =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                  mediaItem.mediaMetadata.extras!!.getParcelableArray(
                    "files",
                    AudioFile::class.java,
                  )!!
                else {
                  @Suppress("UNCHECKED_CAST")
                  mediaItem.mediaMetadata.extras!!.getParcelableArray("files")!! as Array<AudioFile>
                },
              artworkUri = mediaItem.mediaMetadata.artworkUri?.toString(),
              startTimeMs = mediaItem.clippingConfiguration.startPositionMs,
              endTimeMs = mediaItem.clippingConfiguration.endPositionMs,
            )
          }
        } else {
          emptyList()
        }
      }
    }

    Function("clearQueue") {
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS)) {
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
        if (player.controller.availableCommands.contains(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)) {
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

    Function("seekToInCurrentMediaItem") { positionMs: Long ->
      runOnMain {
        if (
          player.controller.availableCommands.contains(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
        ) {
          player.controller.seekTo(positionMs)
        }
      }
    }

    Function("seekToMediaItem") { mediaItemIndex: Int, positionMs: Long ->
      runOnMain {
        if (player.controller.availableCommands.contains(Player.COMMAND_SEEK_TO_MEDIA_ITEM)) {
          player.controller.seekTo(mediaItemIndex, positionMs)
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

    Function("startDownloadUpdates") {
      if (!downloadUpdatesStarted) {
        synchronized(this) {
          if (!downloadUpdatesStarted) {
            val downloadManager =
              AudioSingletonHolder.getDownloadManager(
                appContext.throwingActivity.applicationContext
              )

            downloadManagerListener.ifNull {
              val listener =
                object : DownloadManager.Listener {
                  override fun onDownloadRemoved(
                    downloadManager: DownloadManager,
                    download: Download,
                  ) {
                    queueDownloadUpdateEvent("removed", download)
                  }

                  override fun onDownloadChanged(
                    downloadManager: DownloadManager,
                    download: Download,
                    finalException: Exception?,
                  ) {
                    queueDownloadUpdateEvent("changed", download)
                  }
                }

              downloadManager.addListener(listener)

              downloadManagerListener = listener
            }

            downloadUpdateJob.ifNull {
              downloadUpdateJob =
                flow {
                    while (true) {
                      emit(Unit)
                      delay(100)

                      downloadManager.currentDownloads.forEach { download ->
                        if (download.state == Download.STATE_DOWNLOADING) {
                          queueDownloadUpdateEvent("progress", download)
                        }
                      }

                      withContext(Dispatchers.Main) {
                        synchronized(downloadUpdateLock) {
                          if (downloadUpdateEvents.size > 0) {
                            sendEvent(
                              AUDIO_EVENT_DOWNLOAD_STATUS_UPDATE,
                              mapOf("events" to downloadUpdateEvents),
                            )
                            downloadUpdateEvents.clear()
                          }
                        }
                      }
                    }
                  }
                  .launchIn(downloadUpdateJobScope)
            }

            downloadUpdatesStarted = true
          }
        }
      }
    }

    AsyncFunction("getAllDownloads") Coroutine
      { instanceId: String ->
        val downloads = mutableMapOf<String, AudioDownloadStatus>()
        val downloadManager =
          AudioSingletonHolder.getDownloadManager(appContext.throwingActivity.applicationContext)
        downloadManager.downloadIndex.getDownloads().use { downloadCursor ->
          while (downloadCursor.moveToNext()) {
            if (downloadCursor.download.request.id.startsWith("${instanceId}-")) {
              downloads[downloadCursor.download.request.id.removePrefix("${instanceId}-")] =
                AudioDownloadStatus(
                  id = downloadCursor.download.request.id,
                  state = downloadCursor.download.state,
                  paused = downloadManager.downloadsPaused,
                  bytesDownloaded = downloadCursor.download.bytesDownloaded,
                  percentDownloaded = downloadCursor.download.percentDownloaded,
                  contentLength = downloadCursor.download.contentLength,
                  failureReason = downloadCursor.download.failureReason,
                  isTerminalState = downloadCursor.download.isTerminalState,
                  stopReason = downloadCursor.download.stopReason,
                  startTimeMs = downloadCursor.download.startTimeMs,
                  updateTimeMs = downloadCursor.download.updateTimeMs,
                )
            }
          }
        }

        return@Coroutine downloads
      }

    AsyncFunction("getAllDownloadIds") Coroutine
      { instanceId: String ->
        val downloadManager =
          AudioSingletonHolder.getDownloadManager(appContext.throwingActivity.applicationContext)
        val fileIds = mutableSetOf<String>()
        downloadManager.downloadIndex.getDownloads().use { downloadCursor ->
          while (downloadCursor.moveToNext()) {
            if (downloadCursor.download.request.id.startsWith("${instanceId}-")) {
              fileIds.add(downloadCursor.download.request.id.removePrefix("${instanceId}-"))
            }
          }
        }

        return@Coroutine fileIds
      }

    AsyncFunction("getDownloads") Coroutine
      { instanceId: String, fileIds: Array<String> ->
        val downloads = mutableMapOf<String, AudioDownloadStatus>()
        val downloadManager =
          AudioSingletonHolder.getDownloadManager(appContext.throwingActivity.applicationContext)

        fileIds.forEach { fileId ->
          downloadManager.downloadIndex.getDownload("${instanceId}-${fileId}")?.let { download ->
            downloads[download.request.id.removePrefix("${instanceId}-")] =
              AudioDownloadStatus(
                id = download.request.id,
                state = download.state,
                paused = downloadManager.downloadsPaused,
                bytesDownloaded = download.bytesDownloaded,
                percentDownloaded = download.percentDownloaded,
                contentLength = download.contentLength,
                failureReason = download.failureReason,
                isTerminalState = download.isTerminalState,
                stopReason = download.stopReason,
                startTimeMs = download.startTimeMs,
                updateTimeMs = download.updateTimeMs,
              )
          }
        }

        return@Coroutine downloads
      }

    Function("getDownload") { id: String ->
      val downloadManager =
        AudioSingletonHolder.getDownloadManager(appContext.throwingActivity.applicationContext)

      return@Function downloadManager.downloadIndex.getDownload(id)?.let {
        AudioDownloadStatus(
          id = it.request.id,
          state = it.state,
          paused = downloadManager.downloadsPaused,
          bytesDownloaded = it.bytesDownloaded,
          percentDownloaded = it.percentDownloaded,
          contentLength = it.contentLength,
          failureReason = it.failureReason,
          isTerminalState = it.isTerminalState,
          stopReason = it.stopReason,
          startTimeMs = it.startTimeMs,
          updateTimeMs = it.updateTimeMs,
        )
      } ?: run { null }
    }

    Function("addDownloads") { instanceId: String, files: List<AudioDownload> ->
      appContext.reactContext?.let { context ->
        if (
          context.applicationContext.applicationInfo.targetSdkVersion >=
            Build.VERSION_CODES.TIRAMISU &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !NotificationManagerCompat.from(context).areNotificationsEnabled()
        ) {
          appContext.permissions?.let { permissionManager ->
            permissionManager.askForPermissions(
              { sendAddDownloads(instanceId, files) },
              Manifest.permission.POST_NOTIFICATIONS,
            )
          } ?: run { sendAddDownloads(instanceId, files) }
        } else {
          sendAddDownloads(instanceId, files)
        }
      } ?: run { sendAddDownloads(instanceId, files) }
    }

    Function("resumeDownloads") {
      DownloadService.sendResumeDownloads(
        appContext.throwingActivity.applicationContext,
        VoelAudioDownloadService::class.java,
        false,
      )
    }

    Function("pauseDownloads") {
      DownloadService.sendPauseDownloads(
        appContext.throwingActivity.applicationContext,
        VoelAudioDownloadService::class.java,
        false,
      )
    }

    Function("removeDownloads") { instanceId: String, fileIds: LongArray ->
      fileIds.map { fileId ->
        DownloadService.sendRemoveDownload(
          appContext.throwingActivity.applicationContext,
          VoelAudioDownloadService::class.java,
          "${instanceId}-${fileId}",
          false,
        )
      }
    }
  }

  @OptIn(UnstableApi::class)
  private fun sendAddDownloads(instanceId: String, files: List<AudioDownload>) {
    files.forEach { file ->
      val downloadId = "${instanceId}-${file.fileId}"

      DownloadService.sendAddDownload(
        appContext.throwingActivity.applicationContext,
        VoelAudioDownloadService::class.java,
        DownloadRequest.Builder(downloadId, file.uri.toUri())
          .setCustomCacheKey(downloadId)
          .setData(
            AudioDownloadData(
                instanceId = instanceId,
                fileId = file.fileId,
                bookId = file.bookId,
                bookTitle = file.bookTitle,
                bookAuthors = file.bookAuthors,
              )
              .toByteArray()
          )
          .build(),
        false,
      )
    }
  }

  @OptIn(UnstableApi::class)
  internal fun queueDownloadUpdateEvent(type: String, download: Download) {
    val event =
      when (type) {
        "removed" -> {
          mapOf("type" to "removed", "id" to download.request.id)
        }

        "progress" -> {
          mapOf(
            "type" to "progress",
            "id" to download.request.id,
            "bytesDownloaded" to download.bytesDownloaded,
            "percentDownloaded" to download.percentDownloaded,
            "contentLength" to download.contentLength,
          )
        }

        else -> {
          mapOf(
            "type" to type,
            "id" to download.request.id,
            "state" to download.state,
            "paused" to
              AudioSingletonHolder.getDownloadManager(
                  appContext.throwingActivity.applicationContext
                )
                .downloadsPaused,
            "bytesDownloaded" to download.bytesDownloaded,
            "percentDownloaded" to download.percentDownloaded,
            "contentLength" to download.contentLength,
            "failureReason" to download.failureReason,
            "isTerminalState" to download.isTerminalState,
            "stopReason" to download.stopReason,
            "startTimeMs" to download.startTimeMs,
            "updateTimeMs" to download.updateTimeMs,
          )
        }
      }

    synchronized(downloadUpdateLock) { downloadUpdateEvents.add(event) }
  }

  private fun <T> runOnMain(block: () -> T): T =
    runBlocking(appContext.mainQueue.coroutineContext) { block() }
}
