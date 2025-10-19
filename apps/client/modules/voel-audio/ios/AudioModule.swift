import AVFoundation
import ExpoModulesCore

public class VoelAudioModule: Module {
    private var player = AudioPlayer.shared

    public func definition() -> ModuleDefinition {
        Name("VoelAudio")

        OnCreate {
            player.sendEvent = sendEvent
        }

        Events(AudioConstants.playbackStatus)

        Property("isBuffering") {
            player.isBuffering
        }

        Property("currentStatus") {
            player.currentStatus()
        }

        Property("isLoaded") {
            player.isLoaded
        }

        Property("playing") {
            player.isPlaying
        }

        Property("muted") {
            player.isMuted
        }.set { (isMuted: Bool) in
            self.player.isMuted = isMuted
        }

        Property("shouldCorrectPitch") {
            player.shouldCorrectPitch
        }.set { (shouldCorrectPitch: Bool) in
            self.player.shouldCorrectPitch = shouldCorrectPitch
        }

        Property("currentTime") {
            player.currentTime
        }

        Property("duration") {
            player.duration
        }

        Property("playbackRate") {
            return if player.isPlaying {
                player.rate
            } else {
                player.currentRate
            }
        }

        Property("volume") {
            player.volume
        }.set { (volume: Double) in
            self.player.volume = Float(volume)
        }

        Function("getLastPlaybackHistoryEvent") { (instanceId: String) in
            ["instanceId": instanceId, "events": []]
        }

        Function("startPlaybackHistoryUpdates") { (instanceId: String) in
        }

        AsyncFunction("deletePlaybackHistoryOlderThan") { (instanceId: String, timestamp: Int64) in
        }

        Function("play") {
            player.play(at: player.currentRate > 0 ? player.currentRate : 1.0)
        }

        Function("pause") {
            player.pause()
        }

        Function("setCookie") { (cookie: String) in
            AudioSingletonHolder.setCookie(cookie)
        }

        AsyncFunction("replace") { (source: [AudioSource], startIndex: Int, startPositionMs: Int64) in
            player.setAudioSources(audioSources: source, startIndex: startIndex, startPositionMs: startPositionMs)
        }

        Function("getCurrentQueue") {
            player.getCurrentQueue()
        }

        Function("clearQueue") {
            player.clearQueue()
        }

        Function("canSkipToNext") {
            player.canSkipToNext()
        }

        Function("canSkipToPrevious") {
            player.canSkipToPrevious()
        }

        Function("skipToNext") {
            player.advanceToNextItem()
        }

        Function("skipToPrevious") {
            player.seekToPrevious(positionMs: 0)
        }

        Function("seekToInCurrentMediaItem") { (positionMs: Int64) in
            player.seekTo(positionMs: positionMs)
        }

        Function("seekToMediaItem") { (mediaItemIndex: Int, positionMs: Int64) in
            player.seekTo(queueIndex: mediaItemIndex, position: CMTime(value: positionMs, timescale: CMTimeScale(MSEC_PER_SEC)))
        }

        Function("setPlaybackRate") { (rate: Double) in
            player.setPlaybackRate(rate: Float(rate))
        }

        Function("startDownloadUpdates") {}

        AsyncFunction("getAllDownloads") {}

        AsyncFunction("getAllDownloadIds") {}

        AsyncFunction("getDownloads") {}

        Function("getDownload") { (id: String) in }

        Function("addDownloads") { (instanceId: String, files: [AudioDownload]) in }

        Function("resumeDownloads") {}

        Function("pauseDownloads") {}

        Function("removeDownloads") { (instanceId: String, files: [AudioDownload]) in }
    }
}
