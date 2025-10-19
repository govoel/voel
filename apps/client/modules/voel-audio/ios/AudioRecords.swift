import ExpoModulesCore

public struct AudioSource: Record {
    public init() {}
    
    @Field var instanceId: String?
    @Field var bookId: Int64?
    @Field var chapterId: Int64?
    @Field var bookTitle: String?
    @Field var chapterTitle: String?
    @Field var author: String?
    @Field var files: [AudioFile]
    @Field var artworkUri: URL?
    @Field var startTimeMs: Int64?
    @Field var endTimeMs: Int64?
}

public struct AudioFile: Record {
    public init() {}
    
    @Field var id: Int64?
    @Field var uri: URL?
    @Field var durationMs: Int64?
}

public struct AudioDownload: Record {
    public init() {}
    
    @Field var uri: String?
    @Field var fileId: Int64?
    @Field var bookId: Int64?
    @Field var bookTitle: String?
    @Field var bookAuthors: String?
}
