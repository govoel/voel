import { Array, Effect, Match, Option, Stream } from 'effect';
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

/** Display order for media type choices. */
export const mediaTypes = ['movie', 'show', 'audiobook'] as const satisfies ReadonlyArray<
  typeof Library.json.fields.type.Encoded
>;

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
        const library = yield* Option.match(id, {
          onNone: () => Effect.succeedNone,
          onSome: (libraryId) =>
            client.library.get({ params: { id: libraryId } }).pipe(Effect.asSome),
        });
        const storage = yield* loadStoragePluginSettingsForms({
          account,
          id,
          storagePluginId: Option.match(library, {
            onNone: () => Library.jsonCreate.fields.storagePluginId.make('builtin:local'),
            onSome: (saved) => saved.storagePluginId,
          }),
        });
        return {
          storage,
          name: Option.match(library, { onNone: () => '', onSome: (saved) => saved.name }),
          type: Option.match(library, {
            onNone: () =>
              Array.findFirst(mediaTypes, (type) => storage.forms[type] !== void 0).pipe(
                Option.getOrElse(() => Array.headNonEmpty(mediaTypes))
              ),
            onSome: (saved): typeof Library.json.fields.type.Encoded => saved.type,
          }),
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

export const mediaTypeLabel = ({ type }: Pick<typeof Library.json.Encoded, 'type'>) =>
  Match.value(type).pipe(
    Match.when('movie', () => 'Movies'),
    Match.when('show', () => 'TV shows'),
    Match.when('audiobook', () => 'Audiobooks'),
    Match.exhaustive
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
