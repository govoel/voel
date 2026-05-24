package app.voel.designsystem

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ExpoUIView

class VoelDesignSystemModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VoelDesignSystem")

    ExpoUIView<SegmentedListProps>("SegmentedList") {
      Content { props ->
        SegmentedListContent(props)
      }
    }

    ExpoUIView<SegmentedListItemProps>("SegmentedListItem") {
      val onSegmentedListItemClick by Event<SegmentedListItemClickEvent>()

      Content { props ->
        SegmentedListItemContent(props) { onSegmentedListItemClick(it) }
      }
    }
  }
}
