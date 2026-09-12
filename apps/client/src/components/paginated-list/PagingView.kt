package app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import app.voel.paging.NativePager
import app.voel.paging.PageCancellation
import app.voel.paging.PageDelivery
import app.voel.paging.PageRequestEvent
import app.voel.paging.PagingOptions
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.ComposeViewBuilderScope
import expo.modules.kotlin.views.FunctionalComposableScope

interface PagingViewProps : ComposeProps {
    val paging: PagingOptions?
}

/** Installs private view commands/events and owns one pager per native composition. */
fun <Props : PagingViewProps, Value : Any> ComposeViewBuilderScope<Props>.PagingContent(
    decode: (Map<String, Any?>) -> Value,
    content: @Composable FunctionalComposableScope.(Props, NativePager<Value>) -> Unit,
) {
    val onPageRequest by Event<PageRequestEvent>()
    val onPageCancel by Event<PageCancellation>()
    val resolvePage by AsyncFunction<PageDelivery>()
    val rejectPage by AsyncFunction<PageCancellation>()

    Content { props ->
        val options = props.paging ?: return@Content
        val pager = remember(options.pageSize, options.maxResidentItems) {
            NativePager(options, decode, { onPageRequest(it) }, { onPageCancel(it) })
        }
        resolvePage.handle { pager.resolve(it) }
        rejectPage.handle { pager.reject(it) }
        DisposableEffect(pager) {
            pager.start()
            onDispose { pager.close() }
        }
        content(props, pager)
    }
}
