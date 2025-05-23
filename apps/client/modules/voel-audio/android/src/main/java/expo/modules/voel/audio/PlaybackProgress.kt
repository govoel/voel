package expo.modules.voel.audio

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Delete
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

const val EVENT_TYPE_PLAY = 1002
const val EVENT_TYPE_PAUSE = 1003
const val EVENT_TYPE_SEEK_START = 1004
const val EVENT_TYPE_SEEK_END = 1005
const val EVENT_TYPE_BOOK_CHANGE = 1006
const val EVENT_TYPE_SESSION_END = 1007

@Database(version = 1, entities = [PlaybackHistory::class])
abstract class PlaybackHistoryDatabase : RoomDatabase() {
  abstract fun playbackHistoryDao(): PlaybackHistoryDao

  companion object {
    @Volatile
    private var instances = mutableMapOf<String, PlaybackHistoryDatabase>()

    fun getDatabase(context: Context, instanceId: String): PlaybackHistoryDatabase {
      return instances[instanceId]
        ?: synchronized(this) {
          val instanceDb =
            Room.databaseBuilder(
              context.applicationContext,
              PlaybackHistoryDatabase::class.java,
              "VoelPlaybackHistory-${instanceId}.db"
            )
              .build()
          instances[instanceId] = instanceDb
          return instanceDb
        }
    }
  }
}

@Entity(tableName = "playbackHistory")
data class PlaybackHistory(
  @PrimaryKey(autoGenerate = true) val id: Int?,
  @ColumnInfo(name = "type") val type: Int,
  @ColumnInfo(name = "bookId") val bookId: Long,
  @ColumnInfo(name = "positionMs") val positionMs: Long,
  @ColumnInfo(name = "eventTimestampMs") val eventTimestampMs: Long
)

@Dao
interface PlaybackHistoryDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insert(vararg event: PlaybackHistory)

  @Delete
  suspend fun delete(vararg event: PlaybackHistory)

  @Query("DELETE FROM playbackHistory WHERE eventTimestampMs <= :timestamp")
  suspend fun deleteEventsOlderThan(timestamp: Long)

  // we order by type because often seek start and seek end have the same eventTimestampMs
  @Query("SELECT * FROM playbackHistory ORDER BY eventTimestampMs DESC, type DESC")
  fun getAll(): Flow<List<PlaybackHistory>>
}
