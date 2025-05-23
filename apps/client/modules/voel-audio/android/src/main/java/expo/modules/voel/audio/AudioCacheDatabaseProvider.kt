package expo.modules.voel.audio

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.DatabaseProvider
import androidx.media3.database.StandaloneDatabaseProvider

@UnstableApi
object AudioCacheDatabaseProvider {
  @Volatile
  private var standaloneDatabaseProvider: StandaloneDatabaseProvider? = null

  fun get(context: Context): DatabaseProvider {
    return standaloneDatabaseProvider
      ?: synchronized(this) {
        val db = StandaloneDatabaseProvider(context)
        standaloneDatabaseProvider = db
        return db
      }
  }
}
