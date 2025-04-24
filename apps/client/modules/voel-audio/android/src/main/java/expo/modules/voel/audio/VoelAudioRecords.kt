package expo.modules.voel.audio

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AudioSource(
        @Field val instanceId: String?,
        @Field val bookId: Long,
        @Field val fileId: Long,
        @Field val chapterId: Long,
        @Field val bookTitle: String,
        @Field val chapterTitle: String,
        @Field val author: String,
        @Field val fileUri: String,
        @Field val artworkUri: String?,
        @Field val startTimeMs: Long,
        @Field val endTimeMs: Long?
) : Record
