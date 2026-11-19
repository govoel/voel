import type { MediaType } from '@govoel/plugins/library';
import { Array, Effect, Match, Option, Schema, Stream } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import type { Library, StoragePluginStatus } from '@repo/spec-api/domains/library/schema.ts';
import { StoragePluginHealth } from '@repo/spec-api/domains/library/schema.ts';
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

export const mediaTypes = ['movie', 'show', 'audiobook'] as const satisfies ReadonlyArray<
  typeof MediaType.Encoded
>;

export const mediaTypeLabel = ({ type }: Pick<typeof Library.json.Encoded, 'type'>) =>
  Match.value(type).pipe(
    Match.literalsExhaustive({
      movie: () => 'Movies',
      show: () => 'TV shows',
      audiobook: () => 'Audiobooks',
    })
  );

export const storagePluginFormsAtom = Atom.family(
  ({
    account,
    id,
    storagePluginId,
  }: {
    readonly account: AccountKey;
    readonly id: Option.Option<typeof Library.fields.id.Type>;
    readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Type;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* () {
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        return yield* client.library.getStoragePluginSettingsForms({
          payload: { id, storagePluginId },
        });
      })
    ).pipe(
      Atom.withReactivity(['library']),
      Atom.setIdleTTL('5 minutes'),
      Atom.withLabel('storagePluginFormsAtom')
    )
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

export const StorageSource = Schema.Literals(['builtin:local', 'npm']);

export const storageSourceLabel = ({ source }: { readonly source: typeof StorageSource.Type }) =>
  Match.value(source).pipe(
    Match.literalsExhaustive({
      'builtin:local': () => 'Local folders',
      npm: () => 'Custom plugin',
    })
  );

export const storageProviderLabel = ({
  storagePluginId,
}: Pick<typeof Library.json.Type, 'storagePluginId'>) =>
  storageSourceLabel({
    source: Match.value(storagePluginId).pipe(
      Match.when('builtin:local', () => 'builtin:local' as const),
      Match.when(NpmPluginId.is, () => 'npm' as const),
      Match.exhaustive
    ),
  });

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
