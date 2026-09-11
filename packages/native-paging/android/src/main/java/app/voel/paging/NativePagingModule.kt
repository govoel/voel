package app.voel.paging

import app.voel.paging.core.PageItem
import app.voel.paging.core.PageSnapshot
import app.voel.paging.core.PageStatus
import app.voel.paging.core.PagingSession
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
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
    @Field val id: String = ""
    @Field val value: Map<String, Any?> = emptyMap()
}

class NativePager(runtime: Runtime, options: PagingOptions) : SharedObject(runtime) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val current = MutableStateFlow(
        PageSnapshot(emptyList(), PageStatus.LOADING, PageStatus.READY, PageStatus.READY)
    )
    val snapshots = current.asStateFlow()
    private var session: PagingSession? = PagingSession(
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
        scope.launch { session?.resolve(id, items.map { PageItem(it.id, it.value) }, total) }
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

class NativePagingModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("VoelNativePaging")
        Class<NativePager>("Pager") {
            Constructor { options: PagingOptions -> NativePager(runtime, options) }
            Function("start") { pager: NativePager -> pager.start() }
            Function("refresh") { pager: NativePager -> pager.refresh() }
            Function("retry") { pager: NativePager -> pager.retry() }
            Function("resolve") { pager: NativePager, id: Int, items: List<PagingItemRecord>, total: Int ->
                pager.resolve(id, items, total)
            }
            Function("reject") { pager: NativePager, id: Int -> pager.reject(id) }
            Function("close") { pager: NativePager -> pager.close() }
        }
    }
}
