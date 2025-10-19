final class AudioSingletonHolder {
    private init() {}
    
    private static var cookie: String? = nil
    private static let queue = DispatchQueue(label: "expo.modules.voel.audio.AudioSingletonHolder", attributes: .concurrent)
    
    static func getCookie() -> String? {
        return queue.sync { cookie }
    }
    
    static func setCookie(_ newCookie: String) {
        queue.sync(flags: .barrier) {
            cookie = newCookie
        }
    }
}
