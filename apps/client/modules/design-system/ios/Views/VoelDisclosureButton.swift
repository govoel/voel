import ExpoModulesCore
import ExpoUI
import SwiftUI

internal final class VoelDisclosureButtonProps: UIBaseViewProps {
  var onDisclosureButtonPress = EventDispatcher()
}

internal struct VoelDisclosureButton: ExpoSwiftUI.View {
  @ObservedObject var props: VoelDisclosureButtonProps

  init(props: VoelDisclosureButtonProps) {
    self.props = props
  }

  var body: some View {
    Button {
      props.onDisclosureButtonPress()
    } label: {
      HStack(alignment: .center) {
        Children()
        Spacer(minLength: 8)
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}
