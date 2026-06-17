package app

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class SegmentedListItem : Module() {
    override fun definition() = ModuleDefinition {
        ExpoUIView<SegmentedListItemProps>("SegmentedListItem") {
            val onSegmentedListItemClick by Event<SegmentedListItemClickEvent>()

            Content { props ->
                SegmentedListItemContent(props) { onSegmentedListItemClick(it) }
            }
        }
    }
}
