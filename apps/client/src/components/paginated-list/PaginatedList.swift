import SwiftUI

private struct PaginationState: Equatable {
  let count: Int
  let waiting: Bool
  let done: Bool
}

/// Supplies native rows to an enclosing List/Section; it does not add a scroll container.
/// The caller loads the initial page. Row builders are evaluated by SwiftUI, not by React.
struct PaginatedList<Item: Identifiable, Row: View>: View {
  let items: [Item]
  let waiting: Bool
  let done: Bool
  let onEndReached: () -> Void
  var prefetchDistance: Int = 5
  var loadingAccessibilityLabel: String = "Loading more items"
  @ViewBuilder let row: (Item) -> Row

  @State private var appearedIDs: Set<Item.ID> = []
  @State private var requestedCount: Int?

  private var paginationState: PaginationState {
    PaginationState(count: items.count, waiting: waiting, done: done)
  }

  var body: some View {
    ForEach(items) { item in
      row(item)
        .onAppear {
          appearedIDs.insert(item.id)
          requestIfNeeded()
        }
        .onDisappear {
          appearedIDs.remove(item.id)
        }
    }
    .task(id: paginationState) {
      if waiting || done {
        requestedCount = nil
      }
      requestIfNeeded()
    }

    if waiting {
      ProgressView()
        .frame(maxWidth: .infinity)
        .accessibilityLabel(loadingAccessibilityLabel)
    }
  }

  private func requestIfNeeded() {
    precondition(prefetchDistance > 0)
    guard !waiting, !done, requestedCount != items.count else { return }

    // SwiftUI may prepare rows ahead of visibility. Share the request latch across rows and
    // recheck on page completion, even when the threshold rows have not appeared again.
    guard items.suffix(prefetchDistance).contains(where: { appearedIDs.contains($0.id) }) else {
      return
    }

    requestedCount = items.count
    onEndReached()
  }
}
