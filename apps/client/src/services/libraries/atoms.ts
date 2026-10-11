import { Effect, Option, Schema, Stream } from 'effect';
import { Atom } from 'effect/reactivity';

import { Library } from '@repo/spec-api/database/schema.ts';

import { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { ApiClientMap } from '#src/services/api-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

/** Value equality keeps query identity stable across renders, accounts, and sign-ins. */
export class LibraryQueryKey extends Schema.Class<
  LibraryQueryKey,
  { readonly brand: unique symbol }
>('voel/services/libraries/atoms/LibraryQueryKey')({
  account: ActiveAccountKey,
  id: Library.fields.id,
}) {}

/** Write to load more; refresh to restart cursor pagination for this account. */
export const listLibrariesAtom = Atom.family((account: ActiveAccountKey) =>
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

export const libraryAtom = Atom.family(({ account, id }: LibraryQueryKey) =>
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

export const libraryStoragePluginSettingsFormAtom = Atom.family(
  ({ account, id }: LibraryQueryKey) =>
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
