internal import ExpoModulesCore
internal import ExpoUI
import SwiftUI
internal import VoelNativePaging

final class ServerUser: Record {
  @Field(.required) var username: String = ""

  init() {}
}

final class ServerUsersListViewProps: PagingViewProps<ServerUser> {
  var onTap = EventDispatcher()
}

struct ServerUsersListView: ExpoSwiftUI.View {
  @ObservedObject var props: ServerUsersListViewProps

  init(props: ServerUsersListViewProps) {
    self.props = props
  }

  var body: some View {
    if let options = props.paging {
      let pager = props.pager(options: options)
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
      .onAppear { pager.start() }
    }
  }
}

final class ServerUsersList: Module {
  public func definition() -> ModuleDefinition {
    ExpoUIView(ServerUsersListView.self) {
      AsyncFunction("resolvePage") { (view: ServerUsersListView, page: PageDelivery) in
        try view.props.resolvePage(page)
      }
      AsyncFunction("rejectPage") { (view: ServerUsersListView, request: PageCancellation) in
        view.props.rejectPage(request)
      }
    }
  }
}
