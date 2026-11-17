import { MediaType } from '@govoel/plugins/library';
import { Array, Effect, Match, Option, Order, Record, Stream } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import type { StoragePluginStatus } from '@repo/spec-api/domains/library/schema.ts';
import { Library, StoragePluginHealth } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { swr } from '#src/runtime/swr.ts';

export const listLibrariesAtom = Atom.family((account: AccountKey) =>
  AppRuntime.pull(
    Effect.fnUntraced(function* () {
      const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
      return Stream.paginate(
        Option.none<typeof Library.fields.id.Type>(),
        Effect.fnUntraced(function* (cursor) {
          const page = yield* client.library.list({ query: { cursor, limit: 20 } });
          return [page.items, Option.map(page.nextCursor, Option.some)] as const;
        })
      );
    }, Stream.unwrap)
  ).pipe(
    Atom.withReactivity(['library']),
    swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true }),
    Atom.withLabel('listLibrariesAtom')
  )
);

export const serverLibraryAtom = Atom.family(
  ({ account, id }: { readonly account: AccountKey; readonly id: typeof Library.fields.id.Type }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* () {
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        return yield* client.library.get({ params: { id } });
      })
    ).pipe(
      Atom.withReactivity(['library']),
      swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true }),
      Atom.withLabel('serverLibraryAtom')
    )
);

/** How each media type is shown. Every media type needs an entry. */
const mediaTypeDisplay = {
  movie: { order: 0, label: 'Movies' },
  show: { order: 1, label: 'TV shows' },
  audiobook: { order: 2, label: 'Audiobooks' },
} satisfies Record.ReadonlyRecord<
  typeof MediaType.Encoded,
  { readonly order: number; readonly label: string }
>;

/** Every media type, in display order. */
export const mediaTypes = Array.sort(
  MediaType.schema.literals,
  Order.mapInput(Order.Number, (type: typeof MediaType.Encoded) => mediaTypeDisplay[type].order)
);

/** A value for every media type. */
export const byMediaType = <A>(f: (type: typeof MediaType.Encoded) => A) =>
  Record.map(mediaTypeDisplay, (_, type) => f(type));

export const mediaTypeLabel = ({ type }: Pick<typeof Library.json.Encoded, 'type'>) =>
  mediaTypeDisplay[type].label;

/**
 * Every settings form a storage plugin offers. With an `id`, the forms start from that library's
 * saved settings, even when they were saved by another plugin.
 */
export const loadStoragePluginSettingsForms = Effect.fnUntraced(function* ({
  account,
  id,
  storagePluginId,
}: {
  readonly account: AccountKey;
  readonly id: Option.Option<typeof Library.fields.id.Type>;
  readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  const forms = yield* client.library.getStoragePluginSettingsForms({
    payload: { id, storagePluginId },
  });
  return { storagePluginId, forms };
});

/**
 * Everything a library form needs before it can render: the library's editable fields and its
 * storage plugin's settings forms. Without an `id`, this describes a new local library.
 * Loaded once per form so background refreshes can't replace values someone is editing.
 */
export const libraryFormAtom = Atom.family(
  ({
    account,
    id,
  }: {
    readonly account: AccountKey;
    readonly id: Option.Option<typeof Library.fields.id.Type>;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* () {
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        const saved = yield* Effect.transposeOption(
          Option.map(id, (libraryId) => client.library.get({ params: { id: libraryId } }))
        );
        const library = Option.match(saved, {
          onNone: () => ({
            name: '',
            type: Option.none(),
            storagePluginId: Library.jsonCreate.fields.storagePluginId.make('builtin:local'),
          }),
          onSome: ({ name, type, storagePluginId }) => ({
            name,
            type: Option.some(type),
            storagePluginId,
          }),
        });
        const storage = yield* loadStoragePluginSettingsForms({
          account,
          id,
          storagePluginId: library.storagePluginId,
        });
        return {
          storage,
          name: library.name,
          // A new library starts as the first media type its storage plugin supports.
          type: Option.getOrElse(library.type, () =>
            Array.findFirst(mediaTypes, (type) => storage.forms[type] !== void 0).pipe(
              Option.getOrElse(() => Array.headNonEmpty(mediaTypes))
            )
          ),
        };
      })
    ).pipe(Atom.withLabel('libraryFormAtom'))
);

export const createLibrary = Effect.fnUntraced(
  function* ({
    account,
    library,
  }: {
    readonly account: AccountKey;
    readonly library: typeof Library.jsonCreate.Type;
  }) {
    const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
    return yield* client.library.create({ payload: library });
  },
  Reactivity.mutation(['library'])
);

export const updateLibrary = Effect.fnUntraced(
  function* ({
    account,
    id,
    library,
  }: {
    readonly account: AccountKey;
    readonly id: typeof Library.fields.id.Type;
    readonly library: typeof Library.jsonUpdate.Type;
  }) {
    const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
    return yield* client.library.update({ params: { id }, payload: library });
  },
  Reactivity.mutation(['library'])
);

export const deleteLibrary = Effect.fnUntraced(
  function* ({
    account,
    id,
  }: {
    readonly account: AccountKey;
    readonly id: typeof Library.fields.id.Type;
  }) {
    const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
    yield* client.library.delete({ params: { id } });
  },
  Reactivity.mutation(['library'])
);

export const storageProviderLabel = ({
  storagePluginId,
}: Pick<typeof Library.json.Type, 'storagePluginId'>) =>
  Match.value(storagePluginId).pipe(
    Match.when('builtin:local', () => 'Local folders'),
    Match.when(NpmPluginId.is, () => 'Custom plugin'),
    Match.exhaustive
  );

export const storageStatusLabel = ({
  status,
}: {
  readonly status: typeof StoragePluginStatus.Type;
}) =>
  Match.value(status).pipe(
    Match.literalsExhaustive({
      healthy: () => 'Built successfully',
      unknown: () => 'Not checked',
      unhealthy: () => 'Needs attention',
    })
  );

export const libraryDetails = ({
  library,
}: {
  readonly library: Atom.Success<ReturnType<typeof serverLibraryAtom>>;
}) => [
  { label: 'Name', value: library.name },
  { label: 'Media type', value: mediaTypeLabel(library) },
];

export const libraryStorageDetails = ({
  library,
}: {
  readonly library: Atom.Success<ReturnType<typeof serverLibraryAtom>>;
}) => [
  { label: 'Provider', value: storageProviderLabel(library) },
  ...Match.value(library.storagePluginId).pipe(
    Match.when('builtin:local', () => []),
    Match.when(NpmPluginId.is, (value) => [{ label: 'Plugin ID', value }]),
    Match.exhaustive
  ),
  { label: 'Plugin status', value: storageStatusLabel(library.storagePluginHealth) },
];

export const libraryStorageErrors = ({
  library,
}: {
  readonly library: Atom.Success<ReturnType<typeof serverLibraryAtom>>;
}) =>
  StoragePluginHealth.match(library.storagePluginHealth, {
    healthy: () => [],
    unknown: () => [],
    unhealthy: ({ errors }) =>
      Array.dedupe(
        Array.map(errors, (error) => error.message || 'Unable to construct the storage plugin.')
      ),
  });
