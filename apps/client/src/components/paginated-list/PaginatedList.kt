@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.LoadingIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.first

/**
 * Owns the scroll container and invokes [row] only inside lazy items. Keep row data in [items],
 * rather than constructing one Expo child view per item. The caller loads the initial page.
 */
@Composable
fun <T> PaginatedList(
    items: List<T>,
    key: (T) -> String,
    waiting: Boolean,
    done: Boolean,
    onEndReached: () -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    prefetchDistance: Int = 5,
    header: (@Composable () -> Unit)? = null,
    row: @Composable (item: T, index: Int) -> Unit
) {
    require(prefetchDistance > 0)

    val listState = rememberLazyListState()
    val currentOnEndReached = rememberUpdatedState(onEndReached)
    val headerCount = if (header == null) 0 else 1

    // Observe visibility rather than composition, since Compose can prefetch off-screen rows.
    // A pagination state emits once, even before JS acknowledges it by setting waiting.
    LaunchedEffect(listState, items.size, waiting, done, prefetchDistance, headerCount) {
        if (items.isNotEmpty() && !waiting && !done) {
            val thresholdIndex = (items.size - prefetchDistance).coerceAtLeast(0)
            snapshotFlow {
                listState.layoutInfo.visibleItemsInfo.any {
                    it.index - headerCount in thresholdIndex until items.size
                }
            }.first { it }
            currentOnEndReached.value()
        }
    }

    LazyColumn(
        state = listState,
        modifier = modifier,
        contentPadding = contentPadding,
        verticalArrangement = verticalArrangement
    ) {
        if (header != null) {
            item(key = "header", contentType = "header") { header() }
        }
        itemsIndexed(
            items = items,
            key = { _, item -> "item:${key(item)}" }
        ) { index, item ->
            row(item, index)
        }
        if (waiting) {
            item(key = "loading", contentType = "loading") {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    LoadingIndicator()
                }
            }
        }
    }
}
