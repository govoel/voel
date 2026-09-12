package app.voel.paging.core

import androidx.paging.CombinedLoadStates
import androidx.paging.LoadState
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingDataEvent
import androidx.paging.PagingDataPresenter
import androidx.paging.PagingSource
import androidx.paging.PagingState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/** Payloads are decoded at the bridge; the engine preserves their type without inspecting fields. */
class PageItem<T : Any>(val id: String, val value: T)

class PageRequest(val id: Int, val offset: Int, val limit: Int)

enum class PageStatus { LOADING, READY, COMPLETE, FAILED }

class PageSnapshot<T : Any>(
    val items: List<PageItem<T>>,
    val refresh: PageStatus,
    val prepend: PageStatus,
    val append: PageStatus,
)

private class Page<T : Any>(val items: List<PageItem<T>>, val total: Int)
private class PageFailure : Exception("Page request failed")

/**
 * One main-thread-confined paging session per query. Both native front ends use the same
 * presenter, eviction policy and request protocol. JS only sees individual page requests.
 */
class PagingSession<T : Any>(
    private val pageSize: Int,
    maxItems: Int,
    private val onRequest: (PageRequest) -> Unit,
    private val onCancel: (Int) -> Unit,
    private val onSnapshot: (PageSnapshot<T>) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val pending = mutableMapOf<Int, CompletableDeferred<Page<T>>>()
    private var nextRequestId = 0
    private var started = false
    private var closed = false
    private var states: CombinedLoadStates? = null
    private val presenter = object : PagingDataPresenter<PageItem<T>>(Dispatchers.Main.immediate) {
        override suspend fun presentPagingDataEvent(event: PagingDataEvent<PageItem<T>>) = Unit
    }
    private val pager = Pager(
        PagingConfig(
            pageSize = pageSize,
            initialLoadSize = pageSize,
            maxSize = maxItems,
            enablePlaceholders = false,
        )
    ) { Source() }

    init {
        presenter.addOnPagesUpdatedListener { publish() }
        presenter.addLoadStateListener {
            states = it
            publish()
        }
    }

    fun start() {
        if (started || closed) return
        started = true
        scope.launch { pager.flow.collectLatest { presenter.collectFrom(it) } }
    }

    /** IDs survive prepend/drop operations; indexes received asynchronously from a UI do not. */
    fun access(id: String) {
        if (closed) return
        val index = presenter.snapshot().items.indexOfFirst { it.id == id }
        if (index >= 0) presenter[index]
    }

    fun retry() {
        if (!closed) presenter.retry()
    }

    fun refresh() {
        if (!closed) presenter.refresh()
    }

    fun resolve(id: Int, items: List<PageItem<T>>, total: Int) {
        pending.remove(id)?.complete(Page(items, total))
    }

    fun reject(id: Int) {
        pending.remove(id)?.completeExceptionally(PageFailure())
    }

    fun close() {
        if (closed) return
        closed = true
        scope.cancel()
        pending.values.toList().forEach { it.cancel() }
        pending.clear()
        onSnapshot(PageSnapshot(emptyList(), PageStatus.COMPLETE, PageStatus.COMPLETE, PageStatus.COMPLETE))
    }

    private fun publish() {
        if (closed) return
        onSnapshot(PageSnapshot(
            presenter.snapshot().items,
            status(states?.refresh),
            status(states?.prepend),
            status(states?.append),
        ))
    }

    private fun status(state: LoadState?) = when (state) {
        null, is LoadState.Loading -> PageStatus.LOADING
        is LoadState.Error -> PageStatus.FAILED
        is LoadState.NotLoading -> if (state.endOfPaginationReached) PageStatus.COMPLETE else PageStatus.READY
    }

    private inner class Source : PagingSource<Int, PageItem<T>>() {
        private val requests = mutableSetOf<Int>()

        init {
            registerInvalidatedCallback {
                requests.toList().forEach { pending[it]?.cancel() }
            }
        }

        override fun getRefreshKey(state: PagingState<Int, PageItem<T>>): Int? =
            state.anchorPosition?.let { state.closestPageToPosition(it)?.itemsBefore }

        override suspend fun load(params: LoadParams<Int>): LoadResult<Int, PageItem<T>> {
            val offset = params.key ?: 0
            val id = ++nextRequestId
            val response = CompletableDeferred<Page<T>>()
            pending[id] = response
            requests.add(id)
            try {
                onRequest(PageRequest(id, offset, pageSize))
                val page = response.await()
                require(page.total >= 0 && page.items.size <= pageSize)
                require(page.items.map { it.id }.distinct().size == page.items.size)
                val end = offset + page.items.size
                require(page.items.isEmpty() || end <= page.total)
                // Backward keys are fixed-size offsets. Reject silently capped/partial interior
                // pages rather than reloading overlapping ranges when the user scrolls back.
                require(page.items.size == minOf(pageSize, (page.total - offset).coerceAtLeast(0)))
                return LoadResult.Page(
                    data = page.items,
                    prevKey = if (offset > 0) (offset - pageSize).coerceAtLeast(0) else null,
                    nextKey = if (page.items.isNotEmpty() && end < page.total) end else null,
                    itemsBefore = offset,
                    itemsAfter = (page.total - end).coerceAtLeast(0),
                )
            } catch (error: CancellationException) {
                onCancel(id)
                throw error
            } catch (error: Exception) {
                return LoadResult.Error(error)
            } finally {
                pending.remove(id)
                requests.remove(id)
            }
        }
    }
}
