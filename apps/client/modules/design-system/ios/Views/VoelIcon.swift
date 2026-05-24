import ExpoModulesCore
import ExpoUI
import SwiftUI

internal final class VoelIconProps: UIBaseViewProps {
  @Field var systemName: String = ""
}

internal struct VoelIcon: ExpoSwiftUI.View {
  @ObservedObject var props: VoelIconProps

  init(props: VoelIconProps) {
    self.props = props
  }

  var body: some View {
    Image(systemName: props.systemName)
  }
}
