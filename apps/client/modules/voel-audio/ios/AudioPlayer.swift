import Combine
import ExpoModulesCore
import MediaPlayer

public enum AudioConstants {
    static let playbackStatus = "playbackStatusUpdate"
}

public struct AudioSourcePlayerItem {
    public var source: AudioSource
    public var composition: AVMutableComposition?
}

struct CachedArtwork {
    var url: URL
    var artwork: MPMediaItemArtwork
}

public class AudioPlayer {
    static let shared = AudioPlayer()

    private let player = AVQueuePlayer()

    let updateIntervalMs: Int64 = 300
    var sendEvent: (String, [String: Any?]) -> Void = { (_, _) in }
    private let shouldQueueItemsAhead = 2

    var shouldCorrectPitch = true
    var currentRate: Float = 1.0

    private var timeToken: Any?
    private var cancellables = Set<AnyCancellable>()
    private var endObserver: NSObjectProtocol?

    private var queue: [AudioSourcePlayerItem] = []
    private var currentQueueIndex = -1

    var isLooping = false

    var duration: Double {
        player.currentItem?.duration.seconds ?? 0.0
    }

    var currentTime: Double {
        player.currentItem?.currentTime().seconds ?? 0.0
    }

    var isLoaded: Bool {
        player.currentItem?.status == .readyToPlay
    }

    var isPlaying: Bool {
        player.timeControlStatus == .playing
    }

    var isMuted: Bool {
        get { player.isMuted }
        set { player.isMuted = newValue }
    }

    var rate: Float {
        player.rate
    }

    var volume: Float {
        get { player.volume }
        set { player.volume = newValue }
    }

    var isBuffering: Bool {
        if isPlaying {
            return false
        }

        if player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
            return true
        }

        if let currentItem = player.currentItem {
            return currentItem.isPlaybackLikelyToKeepUp && currentItem.isPlaybackBufferEmpty
        }

        return true
    }

    private init() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, policy: .longFormAudio)

        setupPublisher()
        setupEndObserver()
    }

    deinit {
        player.pause()
        player.removeAllItems()
        try? AVAudioSession.sharedInstance().setActive(false)

        self.disableRemoteCommands()
        self.clearNowPlayingInfo()

        if let token = timeToken {
            player.removeTimeObserver(token)
        }
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        cancellables.removeAll()
    }

    private func setupPublisher() {
        player.publisher(for: \.currentItem?.status)
            .sink { [unowned self] status in
                guard let status else {
                    return
                }
                if status == .readyToPlay {
                    updateStatus(with: [
                        "isLoaded": true
                    ])
                    self.updateNowPlayingInfo()
                }
            }
            .store(in: &cancellables)

        player.publisher(for: \.timeControlStatus)
            .sink { [unowned self] _ in
                self.updateNowPlayingInfo()
            }
            .store(in: &cancellables)

        player.publisher(for: \.rate)
            .sink { [unowned self] _ in
                self.updateNowPlayingInfo()
            }
            .store(in: &cancellables)

        player.publisher(for: \.currentItem)
            .sink { [unowned self] _ in
                self.updateNowPlayingInfo()
            }
            .store(in: &cancellables)
    }

    func currentStatus() -> [String: Any] {
        let currentDuration = player.status == .readyToPlay ? duration : 0.0
        let rate = isPlaying ? player.rate : currentRate
        let statusDict: [String: Any] = [
            "currentTime": currentTime,
            "playbackState": statusToString(status: player.status),
            "timeControlStatus": timeControlStatusString(status: player.timeControlStatus),
            "reasonForWaitingToPlay": reasonForWaitingToPlayString(
                status: player.reasonForWaitingToPlay),
            "mute": player.isMuted,
            "duration": currentDuration,
            "currentQueueIndex": currentQueueIndex == -1 ? NSNull() : currentQueueIndex,
            "playing": isPlaying,
            "loop": isLooping,
            "didJustFinish": false,
            "isLoaded": isLoaded,
            "playbackRate": rate,
            "shouldCorrectPitch": shouldCorrectPitch,
            "isBuffering": isBuffering,
            "errorCode": player.status == .failed ? 1000 : NSNull(),
        ]

        return statusDict
    }

    func play(at rate: Float) {
        registerTimeObserver()
        try? AVAudioSession.sharedInstance().setActive(true)
        player.playImmediately(atRate: rate)
        updateStatus(with: [:])
    }

    private func updateStatus(with dict: [String: Any]) {
        var arguments = currentStatus()
        arguments.merge(dict) { _, new in new }
        sendEvent(AudioConstants.playbackStatus, arguments)
    }

    private func setupEndObserver() {
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let self = self, let finishedItem = notification.object as? AVPlayerItem else {
                return
            }

            if let finishedIndex = queue.firstIndex(where: { $0.composition == finishedItem.asset })
            {
                let wasLast = finishedIndex == (queue.count - 1)

                if wasLast {
                    if isLooping && !queue.isEmpty {
                        seekTo(queueIndex: 0, position: CMTime.zero)
                        updateStatus(with: [:])
                    } else {
                        currentQueueIndex = -1
                        updateStatus(with: ["didJustFinish": true])
                    }
                } else {
                    advanceToNextItem()
                }
            } else {
                print("finished item was not in our queue")
                // TODO: throw error, since it is unexpected that the player is playing something not in our queue
            }

            self.updateNowPlayingInfo()
        }
    }

    func setAudioSources(audioSources: [AudioSource], startIndex: Int, startPositionMs: Int64) {
        queue = audioSources.map {
            AudioSourcePlayerItem(source: $0, composition: nil)
        }

        seekTo(
            queueIndex: startIndex,
            position: CMTimeMake(value: startPositionMs, timescale: CMTimeScale(MSEC_PER_SEC)))
    }

    public func getQueue() -> [AudioSource] {
        return queue.map { $0.source }
    }

    public func canSkipToNext() -> Bool {
        return currentQueueIndex < queue.count - 1
    }

    public func canSkipToPrevious() -> Bool {
        return currentQueueIndex > 0
    }

    public func pause() {
        player.pause()
    }

    public func setPlaybackRate(rate: Float) {
        let playerRate = rate < 0 ? 0.0 : rate
        currentRate = playerRate

        if isPlaying {
            player.rate = playerRate
        }

        if shouldCorrectPitch {
            player.currentItem?.audioTimePitchAlgorithm = .timeDomain
        } else {
            player.currentItem?.audioTimePitchAlgorithm = .varispeed
        }
    }

    public func advanceToNextItem() {
        currentQueueIndex += 1
        updateStatus(with: [:])

        player.advanceToNextItem()
        play(at: currentRate)

        for i in currentQueueIndex
            + 1..<min(
                queue.count,
                (currentQueueIndex + 1)
                    + (shouldQueueItemsAhead - 1) /* because 1 item is already queued */)
        {
            if queue[i].composition == nil {
                queue[i].composition = createPlayerItem(audioSource: queue[i].source)
            }
            player.insert(AVPlayerItem(asset: queue[i].composition!), after: nil)
        }

        for i in 0..<queue.count {
            if (currentQueueIndex..<min(queue.count, currentQueueIndex + shouldQueueItemsAhead))
                .contains(i)
            {
                continue
            }

            queue[i].composition = nil
        }
    }

    private var urlAssetCache = LRUCache<String, AVAsset>(capacity: 3)

    private func createPlayerItem(audioSource: AudioSource) -> AVMutableComposition {
        let mutableComposition = AVMutableComposition()
        var durationSoFar = CMTime.zero
        var currentInsertTime = CMTime.zero

        for (index, file) in audioSource.files.enumerated() {
            let clipStartPositionMs =
                (index == 0)
                ? CMTimeMake(value: audioSource.startTimeMs!, timescale: CMTimeScale(MSEC_PER_SEC))
                : CMTime.zero
            let clipEndPositionMs =
                (index == audioSource.files.count - 1)
                ? CMTimeMake(value: audioSource.endTimeMs!, timescale: CMTimeScale(MSEC_PER_SEC))
                    - durationSoFar
                : CMTimeMake(value: file.durationMs!, timescale: CMTimeScale(MSEC_PER_SEC))

            try! mutableComposition.insertTimeRange(
                CMTimeRange(
                    start: clipStartPositionMs,
                    end: clipEndPositionMs
                ),
                of: urlAssetCache.get("\(audioSource.instanceId!)-\(file.id!)")
                    ?? createAVAsset(key: "\(audioSource.instanceId!)-\(file.id!)", file: file),
                at: currentInsertTime
            )

            currentInsertTime = currentInsertTime + (clipEndPositionMs - clipStartPositionMs)
            durationSoFar =
                durationSoFar
                + CMTimeMake(value: file.durationMs!, timescale: CMTimeScale(MSEC_PER_SEC))
        }

        return mutableComposition
    }

    private func createAVAsset(key: String, file: AudioFile) -> AVAsset {
        let newAsset = AVURLAsset(
            url: file.uri!,
            options: [
                "AVURLAssetHTTPHeaderFieldsKey": [
                    "Cookie": AudioSingletonHolder.getCookie()
                ]
            ]
        )
        urlAssetCache.put(key, newAsset)
        return newAsset
    }

    public func seekTo(queueIndex: Int, position: CMTime) {
        guard queueIndex >= 0 && queueIndex < queue.count else {
            return
        }

        player.pause()
        player.removeAllItems()

        for i in queueIndex..<min(queue.count, queueIndex + shouldQueueItemsAhead) {
            if queue[i].composition == nil {
                // createPlayerItem can be an expensive operation if the AVURLAsset is not cached
                // so we'll call updateStatus with the currentQueueIndex
                updateStatus(with: ["currentQueueIndex": queueIndex])
                queue[i].composition = createPlayerItem(audioSource: queue[i].source)
            }

            player.insert(AVPlayerItem(asset: queue[i].composition!), after: nil)

            if i == queueIndex {
                player.seek(to: position, toleranceBefore: CMTime.zero, toleranceAfter: CMTime.zero)
                currentQueueIndex = queueIndex

                play(at: currentRate)
                updateStatus(with: [:])
                self.updateNowPlayingInfo()
                self.enableRemoteCommands()
            }
        }

        for i in 0..<queue.count {
            if (queueIndex..<min(queue.count, queueIndex + shouldQueueItemsAhead)).contains(i) {
                continue
            }

            queue[i].composition = nil
        }
    }

    public func seekTo(positionMs: Int64) {
        player.seek(
            to: CMTime(value: positionMs, timescale: CMTimeScale(MSEC_PER_SEC)),
            toleranceBefore: CMTime.zero, toleranceAfter: CMTime.zero)
    }

    public func seekToPrevious(positionMs: Int64) {
        seekTo(
            queueIndex: currentQueueIndex - 1,
            position: CMTimeMake(value: positionMs, timescale: CMTimeScale(MSEC_PER_SEC)))
    }

    public func clearQueue() {
        player.pause()
        player.removeAllItems()

        queue = []
        currentQueueIndex = -1

        updateStatus(with: [:])
    }

    public func getCurrentQueue() -> [AudioSource] {
        return queue.map { $0.source }
    }

    private func registerTimeObserver() {
        // register only one time observer
        if timeToken != nil { return }

        let interval = CMTimeMake(value: updateIntervalMs, timescale: CMTimeScale(MSEC_PER_SEC))
        timeToken = player.addPeriodicTimeObserver(forInterval: interval, queue: nil) { time in
            self.updateStatus(with: [
                "currentTime": time.seconds
            ])
        }
    }

    private var isRemoteCommandCenterSetup = false
    private func enableRemoteCommands() {
        if isRemoteCommandCenterSetup { return }

        let remoteCommandCenter = MPRemoteCommandCenter.shared()

        remoteCommandCenter.playCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }

            play(at: currentRate)
            return .success
        }
        remoteCommandCenter.playCommand.isEnabled = true

        remoteCommandCenter.pauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }

            pause()
            return .success
        }
        remoteCommandCenter.pauseCommand.isEnabled = true

        remoteCommandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }

            if isPlaying {
                pause()
            } else {
                play(at: currentRate)
            }
            return .success
        }
        remoteCommandCenter.togglePlayPauseCommand.isEnabled = true

        remoteCommandCenter.changePlaybackRateCommand.addTarget { [weak self] event in
            guard let self = self, let event = event as? MPChangePlaybackRateCommandEvent else {
                return .commandFailed
            }

            setPlaybackRate(rate: event.playbackRate)
            return .success
        }
        remoteCommandCenter.changePlaybackRateCommand.isEnabled = true

        remoteCommandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }

            seekTo(
                queueIndex: currentQueueIndex,
                position: CMTime(seconds: event.positionTime, preferredTimescale: 1))
            return .success
        }
        remoteCommandCenter.changePlaybackPositionCommand.isEnabled = true

        remoteCommandCenter.skipForwardCommand.addTarget { [weak self] event in
            guard let self = self, let event = event as? MPSkipIntervalCommandEvent else {
                return .commandFailed
            }

            seekTo(
                queueIndex: currentQueueIndex,
                position: player.currentTime()
                    + CMTime(seconds: event.interval, preferredTimescale: 1))
            return .success
        }
        remoteCommandCenter.skipForwardCommand.isEnabled = true

        remoteCommandCenter.skipBackwardCommand.addTarget { [weak self] event in
            guard let self = self, let event = event as? MPSkipIntervalCommandEvent else {
                return .commandFailed
            }

            seekTo(
                queueIndex: currentQueueIndex,
                position: player.currentTime()
                    - CMTime(seconds: event.interval, preferredTimescale: 1))
            return .success
        }
        remoteCommandCenter.skipBackwardCommand.isEnabled = true

        remoteCommandCenter.nextTrackCommand.addTarget { [weak self] event in
            guard let self = self else { return .commandFailed }

            advanceToNextItem()
            return .success
        }
        remoteCommandCenter.nextTrackCommand.isEnabled = true

        remoteCommandCenter.previousTrackCommand.addTarget { [weak self] event in
            guard let self = self else { return .commandFailed }

            seekToPrevious(positionMs: 0)
            return .success
        }
        remoteCommandCenter.previousTrackCommand.isEnabled = true

        remoteCommandCenter.seekForwardCommand.addTarget { [weak self] event in
            guard let self = self, let event = event as? MPSeekCommandEvent else {
                return .commandFailed
            }

            setPlaybackRate(rate: event.type == .beginSeeking ? 3.0 : currentRate)
            return .success
        }
        remoteCommandCenter.seekForwardCommand.isEnabled = true

        remoteCommandCenter.seekBackwardCommand.addTarget { [weak self] event in
            guard let self = self, let event = event as? MPSeekCommandEvent else {
                return .commandFailed
            }

            setPlaybackRate(rate: event.type == .beginSeeking ? -3.0 : currentRate)
            return .success
        }
        remoteCommandCenter.seekBackwardCommand.isEnabled = true

        remoteCommandCenter.stopCommand.isEnabled = false

        isRemoteCommandCenterSetup = true
    }

    private func disableRemoteCommands() {
        let remoteCommandCenter = MPRemoteCommandCenter.shared()

        remoteCommandCenter.playCommand.isEnabled = false
        remoteCommandCenter.pauseCommand.isEnabled = false
        remoteCommandCenter.togglePlayPauseCommand.isEnabled = false
        remoteCommandCenter.changePlaybackRateCommand.isEnabled = false
        remoteCommandCenter.changePlaybackPositionCommand.isEnabled = false
        remoteCommandCenter.skipForwardCommand.isEnabled = false
        remoteCommandCenter.skipBackwardCommand.isEnabled = false
        remoteCommandCenter.nextTrackCommand.isEnabled = false
        remoteCommandCenter.previousTrackCommand.isEnabled = false
        remoteCommandCenter.stopCommand.isEnabled = false
        remoteCommandCenter.seekForwardCommand.isEnabled = false
        remoteCommandCenter.seekBackwardCommand.isEnabled = false

        remoteCommandCenter.playCommand.removeTarget(self)
        remoteCommandCenter.pauseCommand.removeTarget(self)
        remoteCommandCenter.togglePlayPauseCommand.removeTarget(self)
        remoteCommandCenter.changePlaybackRateCommand.removeTarget(self)
        remoteCommandCenter.changePlaybackPositionCommand.removeTarget(self)
        remoteCommandCenter.skipForwardCommand.removeTarget(self)
        remoteCommandCenter.skipBackwardCommand.removeTarget(self)
        remoteCommandCenter.nextTrackCommand.removeTarget(self)
        remoteCommandCenter.previousTrackCommand.removeTarget(self)
        remoteCommandCenter.stopCommand.removeTarget(self)
        remoteCommandCenter.seekForwardCommand.removeTarget(self)
        remoteCommandCenter.seekBackwardCommand.removeTarget(self)
    }

    private func updateNowPlayingInfo() {
        guard currentQueueIndex != -1 else {
            clearNowPlayingInfo()
            return
        }

        // instead of using a new object for nowPlayingInfo, we update the existing one
        // as this prevents the artwork becoming blank when the chapter changes or the user pauses
        // this is ok to do because we're loading the correct artwork later regardless
        var nowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()

        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? player.rate : 0.0
        nowPlayingInfo[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue
        nowPlayingInfo[MPMediaItemPropertyTitle] = queue[currentQueueIndex].source.chapterTitle!
        nowPlayingInfo[MPMediaItemPropertyArtist] = queue[currentQueueIndex].source.author!
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = queue[currentQueueIndex].source.bookTitle!
        nowPlayingInfo[MPMediaItemPropertyAlbumArtist] = queue[currentQueueIndex].source.author!

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo

        loadArtworkFromURL(url: queue[currentQueueIndex].source.artworkUri!) { artwork in
            if let artwork {
                var nowPlayingInfo =
                    MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
                nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
            }
        }
    }

    private func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private var cachedArtwork: CachedArtwork?

    private func loadArtworkFromURL(url: URL, completion: @escaping (MPMediaItemArtwork?) -> Void) {
        if let cachedArtworkURL = cachedArtwork?.url, cachedArtworkURL == url {
            completion(cachedArtwork?.artwork)
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, error in
            if error != nil {
                return
            }

            guard let data, let image = UIImage(data: data) else {
                return
            }

            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            self.cachedArtwork = CachedArtwork(url: url, artwork: artwork)

            completion(artwork)
        }
        .resume()
    }
}

func statusToString(status: AVPlayer.Status) -> String {
    switch status {
    case .readyToPlay:
        return "readyToPlay"
    case .failed:
        return "failed"
    case .unknown:
        return "unknown"
    @unknown default:
        return "unknown"
    }
}

func timeControlStatusString(status: AVPlayer.TimeControlStatus) -> String {
    switch status {
    case .playing:
        return "playing"
    case .paused:
        return "paused"
    case .waitingToPlayAtSpecifiedRate:
        return "waitingToPlayAtSpecifiedRate"
    @unknown default:
        return "unknown"
    }
}

func reasonForWaitingToPlayString(status: AVPlayer.WaitingReason?) -> String {
    guard let status else {
        return "unknown"
    }

    switch status {
    case .evaluatingBufferingRate:
        return "evaluatingBufferingRate"
    case .noItemToPlay:
        return "noItemToPlay"
    case .toMinimizeStalls:
        return "toMinimizeStalls"
    default:
        return "unknown"
    }
}
