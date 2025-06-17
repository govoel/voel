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
  @Field val endTimeMs: Long?,
) : Record

class AudioFile(@Field val id: Long, @Field val uri: String, @Field val durationMs: Long) :
  Record, Parcelable {
  constructor(parcel: Parcel) : this(parcel.readLong(), parcel.readString()!!, parcel.readLong())

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
  @Field val uri: String,
  @Field val filePath: String,
  @Field val fileId: Long,
  @Field val bookId: Long,
  @Field val bookTitle: String,
  @Field val bookAuthors: String,
) : Record

class AudioDownloadData(
  @Field val instanceId: String,
  @Field val fileId: Long,
  @Field val bookId: Long,
  @Field val bookTitle: String,
  @Field val bookAuthors: String,
) : Record, Parcelable {
  constructor(
    parcel: Parcel
  ) : this(
    parcel.readString()!!,
    parcel.readLong(),
    parcel.readLong(),
    parcel.readString()!!,
    parcel.readString()!!,
  )

  override fun describeContents(): Int {
    return 0
  }

  override fun writeToParcel(dest: Parcel, flags: Int) {
    dest.writeString(instanceId)
    dest.writeLong(fileId)
    dest.writeLong(bookId)
    dest.writeString(bookTitle)
    dest.writeString(bookAuthors)
  }

  fun toByteArray(): ByteArray {
    val parcel = Parcel.obtain()
    writeToParcel(parcel, 0)
    val data = parcel.marshall()
    parcel.recycle()
    return data
  }

  companion object CREATOR : Parcelable.Creator<AudioDownloadData> {
    override fun createFromParcel(parcel: Parcel): AudioDownloadData {
      return AudioDownloadData(parcel)
    }

    fun createFromByteArray(byteArray: ByteArray): AudioDownloadData {
      val parcel = Parcel.obtain()
      parcel.unmarshall(byteArray, 0, byteArray.size)
      parcel.setDataPosition(0)
      val data = createFromParcel(parcel)
      parcel.recycle()
      return data
    }

    override fun newArray(size: Int): Array<AudioDownloadData?> {
      return arrayOfNulls(size)
    }
  }
}

class AudioDownloadStatus(
  @Field val id: String,
  @Field val state: Int,
  @Field val paused: Boolean,
  @Field val bytesDownloaded: Long,
  @Field val percentDownloaded: Float,
  @Field val contentLength: Long,
  @Field val failureReason: Int,
  @Field val isTerminalState: Boolean,
  @Field val stopReason: Int,
  @Field val startTimeMs: Long,
  @Field val updateTimeMs: Long,
) : Record
