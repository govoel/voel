# PaginatedList

Native-only list infrastructure. Feature Expo modules pass data and supply a SwiftUI/Compose
row builder; React does not create a child view for every row. `ServerUsersList` is an example
adapter on both platforms.

- Kotlin owns a `LazyColumn`; do not put it inside another vertical scroll container. Supply
  feature-specific padding, spacing, and an optional native header. Rows receive the item and index.
- Swift supplies rows and a loading indicator to an enclosing SwiftUI `List`/`Section`. Put headers
  and list styling on that enclosing container. Row builders receive the item and must produce
  one list row per item; group multi-element layouts in a stack.
- Keys/`Identifiable` IDs must be unique and stable. Use a new Compose `key`/SwiftUI `.id` scope when
  switching to a different dataset, so scroll and pagination state reset together.
- The caller loads the initial page. Empty, waiting, and completed lists do not request more data.
- `prefetchDistance` is a positive number of rows (default five). Android observes visible rows;
  Swift uses row appearance, which may include SwiftUI's prefetching.
- `onEndReached` emits once per pagination state. The caller acknowledges a request with `waiting`,
  then updates the items and/or `done`. Completing a request rechecks the current rows, even if
  they never disappeared. A waiting cycle can also rearm a request without changing the item count.
- Loaded data is still retained in full. This component virtualizes row UI, not the data source.

Row layout and actions stay in the feature adapter. Native row actions can dispatch Expo events
containing an item ID back to React, just as before; no row factory crosses the JS/native boundary.
