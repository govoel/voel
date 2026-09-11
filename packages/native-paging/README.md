# Native paging

Native owns the resident list. Effect supplies individual pages; React passes an Expo
`SharedObject` handle rather than resending an accumulated array.

## Ownership

- `core/.../PagingSession.kt`: shared AndroidX `Pager`, `PagingSource`, and
  `PagingDataPresenter`. It owns request IDs, load states, refresh generations, and page eviction.
- Android `NativePager`: main-thread session and `StateFlow` for Compose.
- iOS `NativePager`: main-thread session and observable snapshot for SwiftUI.
- `connectPager`: scoped Effect `FiberMap` that fetches, validates, and delivers pages. It retains
  no completed-page cache. Closing the scope removes listeners, cancels work, and closes native state.

Pages contain stable IDs and JSON-compatible feature values. Row styling remains in the app.
Both list adapters report visible IDs, never indexes captured before a prepend/drop. They retain
stable row identities for scroll anchoring. The iOS adapter requires iOS 18.

## Bounds and consistency

The users list requests 50 rows per page with a 250-row retention target and a 10-row prefetch
distance. AndroidX `maxSize` is best-effort: protected pages and insert/drop presentation can
temporarily exceed the target. Retained list data is proportional to the resident/prefetched window, not
the number of pages visited. There is no historical array of rows or IDs in JS.

Each query/account gets a separate native object and Effect scope. Refresh preserves the anchor
page while replacing the Paging generation. Canceled or already-completed request IDs cannot
populate the session. Retrying a failed adjacent load preserves the resident rows.

The loader must provide deterministic ordering and full requested pages except at the end of the
dataset; partial interior pages are rejected because backward keys use fixed-size offsets.
Users are ordered by unique ID. Offset paging
does **not** provide snapshot isolation under concurrent insertions/deletions; refresh after
changes. Cursor/snapshot support would require a different server contract.

## Builds

Use JDK 17 or newer. Gradle is pinned by `core/gradlew`; the first build downloads Kotlin/Native
and AndroidX dependencies. Apple builds require Xcode and an Apple Silicon host/simulator.

Android compiles the same `commonMain` sources with Expo's Kotlin compiler. The isolated KMP
build uses Kotlin 2.4.20 for Kotlin/Native/Xcode support without changing Expo's Kotlin/AGP versions.
Both resolve Paging and coroutines versions from `core/gradle.properties`.

Expo autolinks both iOS pods. The module podspec prepares Kotlin's framework skeleton; Kotlin's
generated CocoaPods build phase builds/syncs the framework for Xcode's architecture and Debug/Release
configuration. Keep `core/VoelPagingCore.podspec` in version control so a clean autolinking scan
can discover it; regenerate it with `core/gradlew -p core podspec` after build configuration changes.
No precompiled framework is committed.

From this directory:

```sh
bun run test                         # Effect transport tests + shared engine JVM tests
core/gradlew -p core iosSimulatorArm64Test
```

Native views must be tested in a development build, not Expo Go. A successful TypeScript check
does not validate the Kotlin/Swift adapters or scroll behavior.
