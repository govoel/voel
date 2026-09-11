internal import ExpoModulesCore
internal import ExpoUI
import SwiftUI
internal import VoelNativePaging

final class ServerUser: Record {
  @Field(.required) var username: String = ""

  init() {}
}

final class ServerUsersPager: NativePager<ServerUser> {
  init(options: PagingOptions, appContext: AppContext) {
    super.init(options: options, decode: { try ServerUser(from: $0, appContext: appContext) })
  }
}

final class ServerUsersListViewProps: UIBaseViewProps {
  @Field var pager: ServerUsersPager?
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
            Text("@\(user.value.username)")
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
    NativePagerDefinition(ServerUsersPager.self) { options in
      ServerUsersPager(options: options, appContext: self.appContext!)
    }
    ExpoUIView(ServerUsersListView.self)
  }
}
