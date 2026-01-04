# Client - Expo React Native App

## OVERVIEW

Offline-first audiobook player. Syncs metadata from Voel server to local SQLite, plays via native audio module.

## STRUCTURE

```
client/
├── app/                    # Expo Router (file-based routing)
│   └── (root)/(tabs)/      # Main tab navigator
│       ├── (home)/         # Feed screens
│       ├── (library)/      # Book/Series/Contributor views
│       └── settings/       # User & admin settings
├── components/
│   ├── ui/                 # Primitives (rn-primitives based)
│   └── icons/              # Lucide icon components
├── lib/
│   ├── api/                # React Query hooks (local DB queries)
│   ├── db/                 # Kysely + SQLite (op-sqlite)
│   └── stores/             # XState stores (instance management)
└── modules/voel-audio/     # Native Expo module (iOS/Android)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add screen | `app/(root)/(tabs)/[group]/` |
| Add UI component | `components/ui/` |
| Add data hook | `lib/api/[entity]/index.ts` |
| Modify local schema | `lib/db/migrations/instance.ts` |
| Audio playback | `modules/voel-audio/` |

## CONVENTIONS

### Routing
- Use `(group)` folders for layout organization
- Dynamic routes: `[param].tsx`
- Layouts: `_layout.tsx` in each group

### Data Fetching
- **Local-first**: Query local SQLite via `lib/api/*`
- **Remote sync**: tRPC subscriptions in `lib/stores/instance/`
- Query keys: Define in `queryKeys` object per module

### Styling
- NativeWind (Tailwind for RN)
- Custom font: `VoelInter-*` variants
- Colors: HSL variables in `tailwind.config.js`

### State
- `@xstate/store` for global state
- `instanceStore` manages server connections
- Each instance has isolated DB + auth

## ANTI-PATTERNS

- **Never** fetch remote data directly in components (use hooks)
- **Never** hardcode instance URLs (use `instanceStore`)
- **Never** use `StyleSheet.create` (use NativeWind)

## COMPLEXITY HOTSPOTS

| File | Lines | Purpose |
|------|-------|---------|
| `app/(root)/(tabs)/(library)/book/[bookId].tsx` | 1286 | Book detail + playback |
| `lib/db/migrations/instance.ts` | 754 | Full local schema |
| `lib/api/books/index.ts` | 683 | Complex Kysely queries |
| `lib/stores/instance/index.ts` | 658 | Sync engine |

## QUERY PATTERNS

```typescript
// Standard query hook pattern
export const useBooks = (instanceId: string) => {
  const db = useInstanceDb(instanceId);
  return useQuery({
    queryKey: booksQueryKeys.list(instanceId),
    queryFn: () => db.selectFrom('book')...
  });
};

// JSON aggregation for relations
.select(eb => [
  jsonArrayFrom(
    eb.selectFrom('bookContributor')...
  ).as('contributors')
])
```
