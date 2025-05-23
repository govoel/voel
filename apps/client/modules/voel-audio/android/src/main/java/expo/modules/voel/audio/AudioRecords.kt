package expo.modules.voel.audio

import android.os.Parcel
import android.os.Parcelable
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AudioSource(
  @Field val instanceId: String?,
  @Field val bookId: Long,
  @Field val chapterId: Long,
  @Field val bookTitle: String,
  @Field val chapterTitle: String,
  @Field val author: String,
  @Field val files: Array<AudioFile>,
  @Field val artworkUri: String?,
  @Field val startTimeMs: Long,
  @Field val endTimeMs: Long?
) : Record

class AudioFile(
  @Field val id: Long,
  @Field val uri: String,
  @Field val durationMs: Long
) : Record, Parcelable {
  constructor(parcel: Parcel) : this(
    parcel.readLong(),
    parcel.readString()!!,
    parcel.readLong()
  )

  override fun describeContents(): Int {
    return 0
  }

  override fun writeToParcel(dest: Parcel, flags: Int) {
    dest.writeLong(id)
    dest.writeString(uri)
    dest.writeLong(durationMs)
  }

  companion object CREATOR : Parcelable.Creator<AudioFile> {
    override fun createFromParcel(parcel: Parcel): AudioFile {
      return AudioFile(parcel)
    }

    override fun newArray(size: Int): Array<AudioFile?> {
      return arrayOfNulls(size)
    }
  }

}

class AudioDownload(
  @Field val id: Long,
  @Field val uri: String,
  @Field val filePath: String
) : Record
