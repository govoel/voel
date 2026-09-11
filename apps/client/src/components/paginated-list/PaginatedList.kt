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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.voel.paging.NativePager
import app.voel.paging.core.PageItem
import app.voel.paging.core.PageStatus
import kotlinx.coroutines.flow.distinctUntilChanged

/** Native rows and stable keys survive prepend/drop operations without a JS item list. */
@Composable
fun PaginatedList(
    pager: NativePager,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    header: (@Composable () -> Unit)? = null,
    row: @Composable (item: PageItem, index: Int, count: Int) -> Unit
) {
    val snapshot by pager.snapshots.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(pager, listState) {
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo.mapNotNull {
                (it.key as? String)?.takeIf { key -> key.startsWith("item:") }?.removePrefix("item:")
            }
        }.distinctUntilChanged().collect { ids ->
            ids.firstOrNull()?.let { pager.access(it) }
            ids.lastOrNull()?.takeIf { it != ids.firstOrNull() }?.let { pager.access(it) }
        }
    }

    LazyColumn(
        state = listState,
        modifier = modifier,
        contentPadding = contentPadding,
        verticalArrangement = verticalArrangement
    ) {
        if (header != null) item(key = "header", contentType = "header") { header() }
        item(key = "refresh", contentType = "status") { PagingStatus(snapshot.refresh, pager) }
        item(key = "prepend", contentType = "status") { PagingStatus(snapshot.prepend, pager) }
        itemsIndexed(snapshot.items, key = { _, item -> "item:${item.id}" }) { index, item ->
            row(item, index, snapshot.items.size)
        }
        if (snapshot.items.isEmpty() && snapshot.refresh == PageStatus.READY) {
            item(key = "empty", contentType = "status") { Text("No items") }
        }
        item(key = "append", contentType = "status") { PagingStatus(snapshot.append, pager) }
    }
}

@Composable
private fun PagingStatus(state: PageStatus, pager: NativePager) {
    when (state) {
        PageStatus.LOADING -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            LoadingIndicator()
        }
        PageStatus.FAILED -> TextButton(onClick = { pager.retry() }, modifier = Modifier.fillMaxWidth()) {
            Text("Couldn't load items. Retry")
        }
        PageStatus.READY, PageStatus.COMPLETE -> Unit
    }
}
