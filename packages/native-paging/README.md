# Native paging

Native views own their paging sessions. React supplies a loader, not a pager handle:

```tsx
const UsersList = createPagedView<UsersListPresentationProps, ServerUser>({
  name: 'ServerUsersList',
});

<UsersList
  key={account.authStorageId}
  fetchPage={fetchUsersPage}
  pageSize={50}
  maxResidentItems={250}
  onTap={handleTap}
/>;
```

`fetchPage({ offset, limit })` returns an Effect with its dependencies provided. Its
result is `{ items: [{ id, value }], total }`, with JSON-compatible rows enforced
at the type level. Loaders own data validation; the bridge does not revalidate
responses. The current engine uses offset pagination: interior pages must contain
`limit` items and `total` must be exact. IDs must remain stable across reloads.

- Change the React `key` when the dataset changes (account, filter, sort, etc.).
  The previous view and its pending fetches are disposed.
- Changing callback identity does not reset paging. Subsequent requests use the
  latest callback; an already-running request retains the loader it started with.
- `pageSize` defaults to 50; `maxResidentItems` defaults to five pages. Changing
  either replaces the native view. The resident target must cover at least three
  pages and is not a hard cap during insertion/prefetch.
- Native retry controls retry failed loads. The iOS list supports pull-to-refresh;
  there is no automatic refresh on focus or foregrounding.

## Native integration

The native view accepts `paging` configuration. Its private bridge
emits `onPageRequest` / `onPageCancel` and exposes `resolvePage` / `rejectPage` view
commands. Request IDs include a native session generation, so replies from replaced
views cannot enter the new session. Completed pages are not cached in JavaScript.

The client’s `PagingContent` (Compose) and `PagingViewProps` (SwiftUI) implement this
contract. Compose remembers and disposes its pager with the composition; SwiftUI
keeps it with the native view’s props, not transient body values. Both use the same
`PagingSession` engine. Row rendering remains native and feature-specific.
