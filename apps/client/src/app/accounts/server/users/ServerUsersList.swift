internal import ExpoModulesCore
import SwiftUI

struct ServerUsersListUser: Record {
  @Field var id: String = ""
  @Field var username: String = ""
}

final class ServerUsersListViewProps: ExpoSwiftUI.ViewProps {
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
    let thresholdIndex = props.users.count - 5

    ForEach(props.users.enumerated(), id: \.element.id) { offset, user in
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
      .task {
        if offset >= thresholdIndex, !props.waiting, !props.done {
          props.onEndReached([:])
        }
      }
    }
  }
}

final class ServerUsersList: Module {
  public func definition() -> ModuleDefinition {
    View(ServerUsersListView.self)
  }
}
