package app.voel.paging

import app.voel.paging.core.PageItem
import app.voel.paging.core.PageSnapshot
import app.voel.paging.core.PageStatus
import app.voel.paging.core.PagingSession
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.records.Required
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.Serializable
import java.util.UUID

class PagingOptions : Record {
    @Field val pageSize: Int = 50
    @Field val maxResidentItems: Int = 250
}

class PagingItemRecord : Record {
    @Field @Required val id: String = ""
    @Field @Required val value: Map<String, Any?> = emptyMap()
}

class PageDelivery : Record {
    @Field @Required val id: String = ""
    @Field @Required val items: List<PagingItemRecord> = emptyList()
    @Field @Required val total: Int = 0
}

class PageCancellation(@Field val id: String = "") : Record, Serializable

class PageRequestEvent(
    @Field val id: String = "",
    @Field val offset: Int = 0,
    @Field val limit: Int = 0,
) : Record, Serializable

/** Main-thread, view-owned state. No Expo shared object or JavaScript-managed lifetime. */
class NativePager<Value : Any>(
    options: PagingOptions,
    private val decode: (Map<String, Any?>) -> Value,
    onRequest: (PageRequestEvent) -> Unit,
    onCancel: (PageCancellation) -> Unit,
) {
    // A recreated native view must never accept a late reply from its predecessor.
    private val generation = UUID.randomUUID().toString()
    private val pending = mutableMapOf<String, Int>()
    private val current = MutableStateFlow(
        PageSnapshot<Value>(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
    )
    val snapshots = current.asStateFlow()
    private var session: PagingSession<Value>? = PagingSession(
        pageSize = options.pageSize,
        maxItems = options.maxResidentItems,
        onRequest = {
            val id = "$generation:${it.id}"
            pending[id] = it.id
            onRequest(PageRequestEvent(id, it.offset, it.limit))
        },
        onCancel = {
            val id = "$generation:$it"
            pending.remove(id)
            onCancel(PageCancellation(id))
        },
        onSnapshot = { current.value = it },
    )

    fun start() { session?.start() }
    fun access(id: String) { session?.access(id) }
    fun retry() { session?.retry() }
    fun resolve(page: PageDelivery) {
        val id = pending[page.id] ?: return
        // Decode atomically; command failures reach JS and reject this request.
        val items = page.items.map { PageItem(it.id, decode(it.value)) }
        pending.remove(page.id)
        session?.resolve(id, items, page.total)
    }
    fun reject(request: PageCancellation) {
        pending.remove(request.id)?.let { session?.reject(it) }
    }
    fun close() {
        session?.close()
        session = null
        pending.clear()
    }
}
