internal import ExpoModulesCore
internal import ExpoUI
import SwiftUI
internal import VoelNativePaging

final class ServerUsersListViewProps: UIBaseViewProps {
  @Field var pager: NativePager?
  var onTap = EventDispatcher()
}

struct ServerUsersListView: ExpoSwiftUI.View {
  @ObservedObject var props: ServerUsersListViewProps

  init(props: ServerUsersListViewProps) {
    self.props = props
  }

  var body: some View {
    if let pager = props.pager {
      PaginatedList(pager: pager, header: { Text("Users").font(.headline) }) { user in
        Button {
          props.onTap([
            "id": user.id
          ])
        } label: {
          HStack {
            Text("@\((user.value as? [String: Any])?["username"] as? String ?? "")")
            Spacer()
            Image(systemName: "chevron.right")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.secondary)
          }
        }
        .tint(.primary)
      }
    }
  }
}

final class ServerUsersList: Module {
  public func definition() -> ModuleDefinition {
    ExpoUIView(ServerUsersListView.self)
  }
}
