import SwiftUI
internal import VoelNativePaging

/// Owns scrolling as well as row identity, so prepending/dropping pages preserves the anchor.
/// Only the bounded resident window participates in SwiftUI identity/layout work.
struct PaginatedList<Value: AnyObject, Header: View, Row: View>: View {
  @ObservedObject var pager: NativePager<Value>
  @ViewBuilder let header: () -> Header
  @ViewBuilder let row: (PageItem<Value>) -> Row
  @State private var anchor: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        header()
        status(pager.snapshot.refresh)
        status(pager.snapshot.prepend)
        LazyVStack(spacing: 0) {
          ForEach(pager.snapshot.items, id: \.id) { item in
            row(item)
              .padding(.horizontal, 16)
              .padding(.vertical, 12)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(Color(uiColor: .secondarySystemGroupedBackground))
              .overlay(alignment: .bottom) {
                if item.id != pager.snapshot.items.last?.id {
                  Divider().padding(.leading, 16)
                }
              }
          }
        }
        .scrollTargetLayout()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        if pager.snapshot.items.isEmpty && pager.snapshot.refresh == .ready {
          Text("No items").foregroundStyle(.secondary)
        }
        status(pager.snapshot.append)
      }
      .padding(16)
    }
    .scrollPosition(id: $anchor)
    .onScrollTargetVisibilityChange(idType: String.self, threshold: 0.1) { ids in
      // Visibility, rather than construction, drives Paging's prefetch and eviction decisions.
      if let first = ids.first { pager.access(id: first) }
      if let last = ids.last, last != ids.first { pager.access(id: last) }
    }
    .refreshable { pager.refresh() }
  }

  @ViewBuilder private func status(_ state: PageStatus) -> some View {
    if state == .loading {
      ProgressView().frame(maxWidth: .infinity).accessibilityLabel("Loading items")
    } else if state == .failed {
      Button("Couldn't load items. Retry") { pager.retry() }
        .frame(maxWidth: .infinity)
    }
  }
}
