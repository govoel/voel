@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.SegmentedListItem as ComposeSegmentedListItem
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import expo.modules.ui.TextContent
import expo.modules.ui.TextProps
import expo.modules.ui.TypographyStyle
import expo.modules.ui.findChildSlotView
import expo.modules.ui.renderSlot
import java.io.Serializable

@OptimizedRecord
data class ServerUsersListUser(
    @Field val id: String = "",
    @Field val username: String = ""
) : Record

@OptimizedRecord
class ServerUsersListEndReachedEvent : Record, Serializable

@OptimizedRecord
data class ServerUsersListTapEvent(
    @Field val id: String = ""
) : Record, Serializable

@OptimizedComposeProps
data class ServerUsersListProps(
    val users: List<ServerUsersListUser> = emptyList(),
    val waiting: Boolean = false,
    val done: Boolean = false
) : ComposeProps

class ServerUsersList : Module() {
    override fun definition() = ModuleDefinition {
        ExpoUIView<ServerUsersListProps>("ServerUsersList") {
            val onEndReached by Event<ServerUsersListEndReachedEvent>()
            val onTap by Event<ServerUsersListTapEvent>()

            Content { props ->
                ServerUsersListContent(props, { onEndReached(it) }, { onTap(it) })
            }
        }
    }
}

@Composable
private fun FunctionalComposableScope.ServerUsersListContent(
    props: ServerUsersListProps,
    onEndReached: (ServerUsersListEndReachedEvent) -> Unit,
    onTap: (ServerUsersListTapEvent) -> Unit
) {
    val header = findChildSlotView(view, "header")
    val leadingContent = findChildSlotView(view, "leadingContent")
    val trailingContent = findChildSlotView(view, "trailingContent")

    PaginatedList(
        items = props.users,
        key = { it.id },
        waiting = props.waiting,
        done = props.done,
        onEndReached = { onEndReached(ServerUsersListEndReachedEvent()) },
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap),
        header = {
            Box(Modifier.padding(bottom = 8.dp - ListItemDefaults.SegmentedGap)) {
                header?.renderSlot()
            }
        }
    ) { user, index ->
        ComposeSegmentedListItem(
            selected = false,
            onClick = { onTap(ServerUsersListTapEvent(user.id)) },
            shapes = ListItemDefaults.segmentedShapes(index = index, count = props.users.size),
            modifier = Modifier.fillMaxWidth(),
            leadingContent = { leadingContent?.renderSlot() },
            trailingContent = { trailingContent?.renderSlot() },
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextContent(
                TextProps(
                    text = "@${user.username}",
                    fontFamily = "Google Sans",
                    typography = TypographyStyle.BODY_LARGE
                )
            )
        }
    }
}
