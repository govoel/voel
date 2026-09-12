@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.FunctionalComposableScope
import expo.modules.kotlin.views.OptimizedComposeProps
import expo.modules.ui.ExpoUIView
import expo.modules.ui.findChildSlotView
import expo.modules.ui.renderSlot
import expo.modules.ui.resolveFontFamily
import kotlinx.coroutines.flow.first
import java.io.Serializable

class ServerUsersList : Module() {
    override fun definition() = ModuleDefinition {
        ExpoUIView<ServerUsersListProps>("ServerUsersList") {
            val onEndReached by Event<Unit>()
            val onTap by Event<ServerUsersListTapEvent>()

            Content { props ->
                ServerUsersListContent(props, { onEndReached(Unit) }, { onTap(it) })
            }
        }
    }
}

@OptimizedRecord
data class ServerUsersListUser(
    @Field val id: String = "",
    @Field val username: String = ""
) : Record

@OptimizedRecord
data class ServerUsersListTapEvent(@Field val id: String) : Record, Serializable

@OptimizedComposeProps
data class ServerUsersListProps(
    val users: List<ServerUsersListUser> = emptyList(),
    val waiting: Boolean = false,
    val done: Boolean = false
) : ComposeProps

@Composable
private fun FunctionalComposableScope.ServerUsersListContent(
    props: ServerUsersListProps,
    onEndReached: () -> Unit,
    onTap: (ServerUsersListTapEvent) -> Unit
) {
    val state = rememberLazyListState()
    val context = LocalContext.current
    val fontFamily = remember(context) { resolveFontFamily("Google Sans", context) }
    val leadingContent = findChildSlotView(view, "leadingContent")
    val trailingContent = findChildSlotView(view, "trailingContent")

    // Wait for actual viewport visibility, not lazy precomposition. Each page can
    // request more only once until its size or loading state changes.
    LaunchedEffect(state, props.users.size, props.waiting, props.done) {
        if (props.waiting || props.done || props.users.isEmpty()) return@LaunchedEffect

        snapshotFlow {
            val layout = state.layoutInfo
            val lastVisibleItem = layout.visibleItemsInfo.lastOrNull()
            // Loading is already false; wait for layout to remove the footer too.
            layout.totalItemsCount == props.users.size &&
                lastVisibleItem != null && lastVisibleItem.index >= props.users.size - 5
        }.first { it }
        onEndReached()
    }

    LazyColumn(
        state = state,
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap)
    ) {
        // Compose creates visible/prefetched rows from data, not a prebuilt React row tree.
        itemsIndexed(props.users, key = { _, user -> user.id }) { index, user ->
            SegmentedListItem(
                selected = false,
                onClick = { onTap(ServerUsersListTapEvent(user.id)) },
                shapes = ListItemDefaults.segmentedShapes(index = index, count = props.users.size),
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                leadingContent = { leadingContent?.renderSlot() },
                trailingContent = { trailingContent?.renderSlot() }
            ) {
                Text(
                    text = "@${user.username}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontFamily = fontFamily
                )
            }
        }
        if (props.waiting) {
            item(key = "loading") {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    LoadingIndicator()
                }
            }
        }
    }
}
