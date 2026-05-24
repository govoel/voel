@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app.voel.designsystem

import android.graphics.Color
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.SegmentedListItem
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import expo.modules.kotlin.views.ComposeProps
import expo.modules.kotlin.views.FunctionalComposableScope
import expo.modules.kotlin.views.OptimizedComposeProps
import expo.modules.ui.ModifierList
import expo.modules.ui.ModifierRegistry
import expo.modules.ui.SlotView
import expo.modules.ui.UIComposableScope
import expo.modules.ui.composeOrNull
import expo.modules.ui.findChildSlotView
import expo.modules.ui.renderSlot
import java.io.Serializable

@OptimizedComposeProps
data class SegmentedListProps(
  val modifiers: ModifierList = emptyList()
) : ComposeProps

@OptimizedRecord
open class SegmentedListItemClickEvent() : Record, Serializable

@OptimizedRecord
data class SegmentedListItemColors(
  @Field val containerColor: Color? = null,
  @Field val contentColor: Color? = null,
  @Field val leadingContentColor: Color? = null,
  @Field val trailingContentColor: Color? = null,
  @Field val supportingContentColor: Color? = null,
  @Field val overlineContentColor: Color? = null
) : Record

@OptimizedComposeProps
data class SegmentedListItemProps(
  val index: Int = 0,
  val count: Int = 1,
  val enabled: Boolean = true,
  val selected: Boolean = false,
  val tonalElevation: Float? = null,
  val shadowElevation: Float? = null,
  val colors: SegmentedListItemColors? = null,
  val modifiers: ModifierList = emptyList()
) : ComposeProps

@Composable
fun FunctionalComposableScope.SegmentedListContent(props: SegmentedListProps) {
  Column(
    verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap),
    modifier = ModifierRegistry.applyModifiers(
      props.modifiers,
      appContext,
      composableScope,
      globalEventDispatcher
    )
  ) {
    Children(UIComposableScope(columnScope = this@Column))
  }
}

@Composable
fun FunctionalComposableScope.SegmentedListItemContent(
  props: SegmentedListItemProps,
  onClick: (SegmentedListItemClickEvent) -> Unit
) {
  val modifier = ModifierRegistry.applyModifiers(
    props.modifiers,
    appContext,
    composableScope,
    globalEventDispatcher
  )

  val defaultColors = ListItemDefaults.segmentedColors()
  val colors = ListItemDefaults.segmentedColors(
    containerColor = props.colors?.containerColor.composeOrNull ?: defaultColors.containerColor,
    contentColor = props.colors?.contentColor.composeOrNull ?: defaultColors.contentColor,
    leadingContentColor = props.colors?.leadingContentColor.composeOrNull
      ?: defaultColors.leadingContentColor,
    trailingContentColor = props.colors?.trailingContentColor.composeOrNull
      ?: defaultColors.trailingContentColor,
    supportingContentColor = props.colors?.supportingContentColor.composeOrNull
      ?: defaultColors.supportingContentColor,
    overlineContentColor = props.colors?.overlineContentColor.composeOrNull
      ?: defaultColors.overlineContentColor
  )

  val headlineSlotView = findChildSlotView(view, "headlineContent")
  val overlineSlotView = findChildSlotView(view, "overlineContent")
  val supportingSlotView = findChildSlotView(view, "supportingContent")
  val leadingSlotView = findChildSlotView(view, "leadingContent")
  val trailingSlotView = findChildSlotView(view, "trailingContent")

  val headlineContent: @Composable () -> Unit = { headlineSlotView?.renderSlot() }
  val overlineContent = overlineSlotView.toComposableSlot()
  val supportingContent = supportingSlotView.toComposableSlot()
  val leadingContent = leadingSlotView.toComposableSlot()
  val trailingContent = trailingSlotView.toComposableSlot()

  SegmentedListItem(
    selected = props.selected,
    onClick = { onClick(SegmentedListItemClickEvent()) },
    shapes = ListItemDefaults.segmentedShapes(index = props.index, count = props.count),
    modifier = modifier,
    enabled = props.enabled,
    leadingContent = leadingContent,
    trailingContent = trailingContent,
    overlineContent = overlineContent,
    supportingContent = supportingContent,
    verticalAlignment = Alignment.CenterVertically,
    colors = colors,
    elevation = ListItemDefaults.elevation(
      props.tonalElevation?.dp ?: ListItemDefaults.Elevation,
      props.shadowElevation?.dp ?: ListItemDefaults.Elevation
    ),
    content = headlineContent
  )
}

private fun SlotView?.toComposableSlot(): (@Composable () -> Unit)? = this?.let { slotView ->
  { slotView.renderSlot() }
}
