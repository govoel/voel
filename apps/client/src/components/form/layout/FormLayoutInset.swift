internal import ExpoModulesCore
import SwiftUI

final class FormLayoutSlotViewProps: ExpoSwiftUI.ViewProps {
  @Field var name: String = ""
}

struct FormLayoutSlotView: ExpoSwiftUI.View {
  @ObservedObject var props: FormLayoutSlotViewProps

  init(props: FormLayoutSlotViewProps) {
    self.props = props
  }

  var body: some View {
    Children()
  }
}

final class FormLayoutInsetViewProps: ExpoSwiftUI.ViewProps {}

struct FormLayoutInsetView: ExpoSwiftUI.View {
  @ObservedObject var props: FormLayoutInsetViewProps

  init(props: FormLayoutInsetViewProps) {
    self.props = props
  }

  private var pageBackground: Color { Color(uiColor: .systemGroupedBackground) }

  private var content: some View {
    slot("content")
      .scrollContentBackground(.hidden)
      .background(pageBackground)
  }

  var body: some View {
    if #available(iOS 26.0, *) {
      content
        .scrollEdgeEffectStyle(.soft, for: .bottom)
        .safeAreaBar(edge: .bottom, spacing: 0) {
          slot("footer")
        }
    } else {
      content
        .safeAreaInset(edge: .bottom, spacing: 0) {
          slot("footer")
            .background {
              pageBackground
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) {
                  // Extend into the list without changing the footer's reserved height.
                  LinearGradient(
                    colors: [pageBackground.opacity(0), pageBackground],
                    startPoint: .top,
                    endPoint: .bottom
                  )
                  .frame(height: 40)
                  .offset(y: -40)
                }
                .allowsHitTesting(false)
            }
        }
    }
  }

  private func slot(_ name: String) -> FormLayoutSlotView? {
    props.children?
      .compactMap { $0.childView as? FormLayoutSlotView }
      .first { $0.props.name == name }
  }
}

final class FormLayoutInset: Module {
  public func definition() -> ModuleDefinition {
    View(FormLayoutInsetView.self)
    View(FormLayoutSlotView.self)
  }
}
