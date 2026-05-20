import ExpoModulesCore
import SwiftUI

internal enum VoelTextStyle: String, Enumerable {
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

internal struct VoelTextStyleModifier: ViewModifier, Record {
  @Field var style: VoelTextStyle = .body

  @ViewBuilder
  func body(content: Content) -> some View {
    switch style {
    case .largeTitle:
      content.font(.largeTitle).fontWeight(.bold)
    case .title:
      content.font(.title).fontWeight(.bold)
    case .title2:
      content.font(.title2).fontWeight(.semibold)
    case .title3:
      content.font(.title3).fontWeight(.semibold)
    case .headline:
      content.font(.headline).fontWeight(.medium)
    case .subheadline:
      content.font(.subheadline).fontWeight(.medium)
    case .body:
      content.font(.body).fontWeight(.regular)
    case .callout:
      content.font(.callout).fontWeight(.regular)
    case .footnote:
      content.font(.footnote).fontWeight(.regular)
    case .caption:
      content.font(.caption).fontWeight(.regular)
    case .caption2:
      content.font(.caption2).fontWeight(.regular)
    }
  }
}
