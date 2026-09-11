internal import ExpoModulesCore
internal import ExpoUI
import SwiftUI

struct ServerUsersListUser: Record, Identifiable {
  @Field var id: String = ""
  @Field var username: String = ""
}

final class ServerUsersListViewProps: UIBaseViewProps {
  @Field var users: [ServerUsersListUser] = []
  @Field var waiting: Bool = false
  @Field var done: Bool = false

  var onEndReached = EventDispatcher()
  var onTap = EventDispatcher()
}

struct ServerUsersListView: ExpoSwiftUI.View {
  @ObservedObject var props: ServerUsersListViewProps

  init(props: ServerUsersListViewProps) {
    self.props = props
  }

  var body: some View {
    PaginatedList(
      items: props.users,
      waiting: props.waiting,
      done: props.done,
      onEndReached: { props.onEndReached([:]) },
      loadingAccessibilityLabel: "Loading more users"
    ) { user in
      Button {
        props.onTap([
          "id": user.id
        ])
      } label: {
        HStack {
          Text("@\(user.username)")
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

final class ServerUsersList: Module {
  public func definition() -> ModuleDefinition {
    ExpoUIView(ServerUsersListView.self)
  }
}
