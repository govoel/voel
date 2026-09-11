package app.voel.paging

import app.voel.paging.core.PageItem
import app.voel.paging.core.PageSnapshot
import app.voel.paging.core.PageStatus
import app.voel.paging.core.PagingSession
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.records.Required
import expo.modules.kotlin.runtime.Runtime
import expo.modules.kotlin.sharedobjects.SharedObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PagingOptions : Record {
    @Field val pageSize: Int = 50
    @Field val maxItems: Int = 250
    @Field val prefetchDistance: Int = 10
}

class PagingItemRecord : Record {
    @Field @Required val id: String = ""
    @Field @Required val value: Map<String, Any?> = emptyMap()
}

open class NativePager<Value : Any>(
    runtime: Runtime,
    options: PagingOptions,
    private val decode: (Map<String, Any?>) -> Value,
) : SharedObject(runtime) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val current = MutableStateFlow(
        PageSnapshot<Value>(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
    )
    val snapshots = current.asStateFlow()
    private var session: PagingSession<Value>? = PagingSession(
        options.pageSize, options.maxItems, options.prefetchDistance,
        onRequest = { emit("request", mapOf("id" to it.id, "offset" to it.offset, "limit" to it.limit)) },
        onCancel = { emit("cancel", mapOf("id" to it)) },
        onSnapshot = { current.value = it },
    )

    fun start() { scope.launch { session?.start() } }
    fun access(id: String) { scope.launch { session?.access(id) } }
    fun retry() { scope.launch { session?.retry() } }
    fun refresh() { scope.launch { session?.refresh() } }
    fun resolve(id: Int, items: List<PagingItemRecord>, total: Int) {
        // Keep decoding synchronous: a bad payload throws back to JS, which rejects the
        // request. Only a completely decoded page enters the main-thread session.
        val decoded = items.map { PageItem(it.id, decode(it.value)) }
        scope.launch { session?.resolve(id, decoded, total) }
    }
    fun reject(id: Int) { scope.launch { session?.reject(id) } }
    fun close() {
        scope.launch {
            session?.close()
            session = null
            scope.cancel()
        }
    }
    override fun sharedObjectDidRelease() { close() }
}

/** Concrete subclasses keep different payload types distinct in Expo's shared-object registry. */
inline fun <reified Pager : NativePager<*>> ModuleDefinitionBuilder.NativePagerDefinition(
    crossinline create: (PagingOptions) -> Pager,
) {
    Class<Pager>("Pager") {
        Constructor { options: PagingOptions -> create(options) }
        Function("start") { pager: Pager -> pager.start() }
        Function("refresh") { pager: Pager -> pager.refresh() }
        Function("retry") { pager: Pager -> pager.retry() }
        Function("resolve") { pager: Pager, id: Int, items: List<PagingItemRecord>, total: Int ->
            pager.resolve(id, items, total)
        }
        Function("reject") { pager: Pager, id: Int -> pager.reject(id) }
        Function("close") { pager: Pager -> pager.close() }
    }
}
