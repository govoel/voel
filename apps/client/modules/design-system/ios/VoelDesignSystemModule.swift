import ExpoModulesCore
import ExpoUI
import SwiftUI

public class VoelDesignSystemModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VoelDesignSystem")

    OnCreate {
      ViewModifierRegistry.register("voelTextStyle") { params, _, _ in
        VoelTextStyleModifier(
          style: VoelTextStyle(rawValue: params["style"] as? String ?? "body") ?? .body
        )
      }
    }

    OnDestroy {
      ViewModifierRegistry.unregister("voelTextStyle")
    }
  }
}

private enum VoelTextStyle: String {
  case largeTitle
  case title
  case title2
  case title3
  case headline
  case subheadline
  case body
  case callout
  case footnote
  case caption
  case caption2
}

private struct VoelTextStyleModifier: ViewModifier {
  let style: VoelTextStyle

  @ViewBuilder
  func body(content: Content) -> some View {
    switch style {
    case .largeTitle:
      content.font(.largeTitle)
    case .title:
      content.font(.title)
    case .title2:
      content.font(.title2)
    case .title3:
      content.font(.title3)
    case .headline:
      content.font(.headline)
    case .subheadline:
      content.font(.subheadline)
    case .body:
      content.font(.body)
    case .callout:
      content.font(.callout)
    case .footnote:
      content.font(.footnote)
    case .caption:
      content.font(.caption)
    case .caption2:
      content.font(.caption2)
    }
  }
}
