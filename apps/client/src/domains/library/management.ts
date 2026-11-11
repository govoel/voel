import { Array, Effect, Match, Option, Stream } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import type { Library, StoragePluginStatus } from '@repo/spec-api/domains/library/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
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

export const libraryFailureMessage = ({
  error,
}: {
  readonly error:
    | Atom.Failure<ReturnType<typeof listLibrariesAtom>>
    | Atom.Failure<ReturnType<typeof serverLibraryAtom>>
    | Effect.Error<ReturnType<typeof deleteLibrary>>;
}) =>
  Match.value(error).pipe(
    Match.tags({
      UnauthorizedError: () => 'Your session has expired. Sign in again.',
      ForbiddenError: () => 'Only server administrators can manage libraries.',
      LibraryNotFoundError: () => 'This library no longer exists.',
      SchemaError: () => 'The server returned an invalid library response.',
      HttpClientError: () => 'Unable to reach the server. Check your connection and try again.',
      BetterAuthClientInitializationError: (failure) => authFailureMessage({ error: failure }),
    }),
    Match.orElse(() => 'Unable to load libraries. Try again.')
  );

export const mediaTypeLabel = ({ type }: Pick<typeof Library.json.Type, 'type'>) =>
  Match.value(type).pipe(
    Match.when('movie', () => 'Movies'),
    Match.when('show', () => 'TV shows'),
    Match.when('audiobook', () => 'Audiobooks'),
    Match.exhaustive
  );

export const storageProviderLabel = ({
  storagePluginId,
}: Pick<typeof Library.json.Type, 'storagePluginId'>) =>
  storagePluginId === 'builtin:local' ? 'Local folders' : 'Custom plugin';

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
  ...(library.storagePluginId === 'builtin:local'
    ? []
    : [{ label: 'Plugin ID', value: library.storagePluginId }]),
  { label: 'Plugin status', value: storageStatusLabel(library.storagePluginHealth) },
];

export const libraryStorageErrors = ({
  library,
}: {
  readonly library: Atom.Success<ReturnType<typeof serverLibraryAtom>>;
}) =>
  library.storagePluginHealth.status === 'unhealthy'
    ? Array.dedupe(
        Array.map(
          library.storagePluginHealth.errors,
          (error) => error.message || 'Unable to construct the storage plugin.'
        )
      )
    : [];
