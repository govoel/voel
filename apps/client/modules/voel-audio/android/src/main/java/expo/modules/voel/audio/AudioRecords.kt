package expo.modules.voel.audio

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AudioSource(
        @Field val instanceId: String?,
        @Field val bookId: Long,
        @Field val chapterId: Long,
        @Field val bookTitle: String,
        @Field val chapterTitle: String,
        @Field val author: String,
        @Field val fileIds: LongArray,
        @Field val fileUris: ArrayList<String>,
        @Field val fileDurations: LongArray,
        @Field val artworkUri: String?,
        @Field val startTimeMs: Long,
        @Field val endTimeMs: Long?
) : Record
