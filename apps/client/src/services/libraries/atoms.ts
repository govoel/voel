import { Effect, Option, Stream } from 'effect';
import { Atom } from 'effect/reactivity';

import type { Library } from '@repo/spec-api/database/schema.ts';

import { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { ApiClientMap } from '#src/services/api-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

// Only account identity and library ID participate in query-cache identity.
const libraryQueryKey = ({
  account,
  id,
}: {
  readonly account: ActiveAccountKey;
  readonly id: Library['id'];
}) => ({ account: ActiveAccountKey.make(account), id });

const listLibrariesFamily = Atom.family((account: ActiveAccountKey) =>
  AppRuntime.pull(
    ApiClientMap.use((clients) => clients.acquire(account)).pipe(
      Effect.map((client) =>
        Stream.paginate(
          Option.none<Library['id']>(),
          Effect.fnUntraced(function* (cursor) {
            const page = yield* client.library.list({ query: { cursor, limit: 10 } });
            return [page.items, page.nextCursor.pipe(Option.map(Option.some))] as const;
          })
        )
      ),
      Stream.unwrap
    )
  ).pipe(
    Atom.withReactivity(['library']),
    swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true }),
    Atom.withLabel('listLibrariesAtom')
  )
);

const libraryFamily = Atom.family(({ account, id }: ReturnType<typeof libraryQueryKey>) =>
  AppRuntime.atom(
    ApiClientMap.use((clients) => clients.acquire(account)).pipe(
      Effect.flatMap((client) => client.library.get({ params: { id } }))
    )
  ).pipe(
    Atom.withReactivity(['library']),
    swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true }),
    Atom.withLabel('libraryAtom')
  )
);

const libraryStoragePluginSettingsFormFamily = Atom.family(
  ({ account, id }: ReturnType<typeof libraryQueryKey>) =>
    AppRuntime.atom(
      ApiClientMap.use((clients) => clients.acquire(account)).pipe(
        Effect.flatMap((client) => client.library.getStoragePluginSettingsForm({ params: { id } }))
      )
    ).pipe(
      Atom.withReactivity(['library']),
      swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true }),
      Atom.withLabel('libraryStoragePluginSettingsFormAtom')
    )
);

/** Write to load more; refresh to restart cursor pagination for this account. */
export const listLibrariesAtom = (account: Parameters<typeof listLibrariesFamily>[0]) =>
  listLibrariesFamily(ActiveAccountKey.make(account));

export const libraryAtom = (input: Parameters<typeof libraryQueryKey>[0]) =>
  libraryFamily(libraryQueryKey(input));

export const libraryStoragePluginSettingsFormAtom = (
  input: Parameters<typeof libraryQueryKey>[0]
) => libraryStoragePluginSettingsFormFamily(libraryQueryKey(input));
