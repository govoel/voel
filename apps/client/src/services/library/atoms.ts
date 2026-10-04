import { Array, Effect, Option, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';

import type { Library } from '@repo/spec-api/database/schema.ts';

import { activeAccountApiClientAtom } from '#src/services/accounts/atoms.ts';
import type { ApiClient } from '#src/services/api-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

type LibraryClient = ApiClient['Service']['library'];

/** Each sign-in owns its caches and invalidation keys, including overlapping library IDs. */
const clientQueries = Atom.family((client: ApiClient['Service']) => {
  const listKey = { client, query: 'library.list' };
  const libraries = Atom.family((id: Library['id']) => {
    const detailKey = { client, id, query: 'library.detail' };
    const formKey = { client, id, query: 'library.settings-form' };
    const healthKeys = [listKey, detailKey];
    const mutationKeys = [...healthKeys, formKey];

    return Atom.make({
      healthKeys,
      mutationKeys,
      detail: AppRuntime.atom(Effect.suspend(() => client.library.get({ params: { id } }))).pipe(
        AppRuntime.factory.withReactivity([detailKey]),
        swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
      ),
      settingsForm: AppRuntime.atom(
        Effect.suspend(() => client.library.getStoragePluginSettingsForm({ params: { id } })).pipe(
          // Building an editor can change cached health even when construction fails.
          Effect.onExit(() => Reactivity.invalidate(healthKeys))
        )
      ).pipe(
        AppRuntime.factory.withReactivity([formKey]),
        swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
      ),
    });
  });

  // Pull pages, not rows: an empty catalog is still a successful first page.
  const list = AppRuntime.pull(
    Stream.paginate(Option.none<Library['id']>(), (cursor) =>
      client.library
        .list({ query: { cursor, limit: 10 } })
        .pipe(
          Effect.map(
            (page) =>
              [
                [page],
                page.nextCursor.pipe(Option.map((nextCursor) => Option.some(nextCursor))),
              ] as const
          )
        )
    )
  ).pipe(
    Atom.mapResult(({ items: pages }) => ({
      items: pages.flatMap((page) => page.items),
      done: Option.isNone(Array.lastNonEmpty(pages).nextCursor),
    })),
    AppRuntime.factory.withReactivity([listKey]),
    swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true })
  );

  return Atom.make({ listKey, list, libraries });
});

/** Switch caches without carrying another account's stale success or failure fallback. */
const activeClientQuery = <A, E>({
  select,
}: {
  readonly select: (
    queries: Atom.Type<ReturnType<typeof clientQueries>>,
    get: Atom.AtomContext
  ) => Atom.Atom<AsyncResult.AsyncResult<A, E>>;
}) => {
  const refreshSignal = Atom.readable(() => Symbol('library.refresh'));
  return Atom.readable(
    (get) => {
      const client = get(activeAccountApiClientAtom);
      if (client.waiting || AsyncResult.isInitial(client)) {
        return AsyncResult.initial<A, E | Atom.Failure<typeof activeAccountApiClientAtom>>(true);
      }
      if (AsyncResult.isFailure(client)) {
        return AsyncResult.failure<A, E | Atom.Failure<typeof activeAccountApiClientAtom>>(
          client.cause
        );
      }
      const query = select(get(clientQueries(client.value)), get);
      get.once(refreshSignal);
      get.subscribe(refreshSignal, () => {
        get.refresh(query);
      });
      return get(query);
    },
    (refresh) => {
      refresh(refreshSignal);
    }
  );
};

const activeList = activeClientQuery({ select: (queries) => queries.list });

/** Write void to load more; refresh restarts at the first cursor. Completed lists ignore writes. */
export const listLibrariesAtom = Atom.writable(
  (get) => get(activeList),
  (get) => {
    const client = get.get(activeAccountApiClientAtom);
    const current = get.get(activeList);
    if (
      AsyncResult.isSuccess(client) &&
      !client.waiting &&
      AsyncResult.isSuccess(current) &&
      !current.waiting &&
      !current.value.done
    ) {
      get.set(get.get(clientQueries(client.value)).list, void 0);
    }
  },
  activeList.refresh
).pipe(Atom.withLabel('listLibrariesAtom'));

export const libraryAtom = Atom.family((id: Library['id']) =>
  activeClientQuery({ select: (queries, get) => get(queries.libraries(id)).detail }).pipe(
    Atom.withLabel(`libraryAtom(${id})`)
  )
);

export const libraryStoragePluginSettingsFormAtom = Atom.family((id: Library['id']) =>
  activeClientQuery({ select: (queries, get) => get(queries.libraries(id)).settingsForm }).pipe(
    Atom.withLabel(`libraryStoragePluginSettingsFormAtom(${id})`)
  )
);

export const createLibraryAtom = AppRuntime.fn<Parameters<LibraryClient['create']>[0]['payload']>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountApiClientAtom, { suspendOnWaiting: true });
    return yield* client.library
      .create({ payload: input })
      .pipe(Reactivity.mutation([get(clientQueries(client)).listKey]));
  })
).pipe(Atom.withLabel('createLibraryAtom'));

export const updateLibraryAtom = AppRuntime.fn<
  Parameters<LibraryClient['update']>[0]['params'] &
    Parameters<LibraryClient['update']>[0]['payload']
>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountApiClientAtom, { suspendOnWaiting: true });
    return yield* client.library
      .update({ params: { id: input.id }, payload: { name: input.name } })
      .pipe(
        // Plugins receive library metadata, so renaming also invalidates the settings editor.
        Reactivity.mutation(get(get(clientQueries(client)).libraries(input.id)).mutationKeys)
      );
  })
).pipe(Atom.withLabel('updateLibraryAtom'));

export const deleteLibraryAtom = AppRuntime.fn<Parameters<LibraryClient['delete']>[0]['params']>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountApiClientAtom, { suspendOnWaiting: true });
    return yield* client.library
      .delete({ params: input })
      .pipe(Reactivity.mutation(get(get(clientQueries(client)).libraries(input.id)).mutationKeys));
  })
).pipe(Atom.withLabel('deleteLibraryAtom'));

/** Accepts the adapter's decoded submission directly; library identity stays outside the form. */
export const setLibraryStoragePluginSettingsAtom = Atom.family((id: Library['id']) =>
  AppRuntime.fn<Parameters<LibraryClient['setStoragePluginSettings']>[0]['payload']['input']>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(activeAccountApiClientAtom, { suspendOnWaiting: true });
      const queries = get(get(clientQueries(client)).libraries(id));
      return yield* client.library
        .setStoragePluginSettings({ params: { id }, payload: { input } })
        .pipe(
          Reactivity.mutation(queries.mutationKeys),
          Effect.onError(() => Reactivity.invalidate(queries.healthKeys))
        );
    })
  ).pipe(Atom.withLabel(`setLibraryStoragePluginSettingsAtom(${id})`))
);

export const setLibraryRootsAtom = AppRuntime.fn<
  Parameters<LibraryClient['setRoots']>[0]['params'] &
    Parameters<LibraryClient['setRoots']>[0]['payload']
>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountApiClientAtom, { suspendOnWaiting: true });
    return yield* client.library
      .setRoots({ params: { id: input.id }, payload: { roots: input.roots } })
      .pipe(
        // Storage construction changes cached health even if root validation subsequently fails.
        Effect.onExit(() =>
          Reactivity.invalidate(get(get(clientQueries(client)).libraries(input.id)).healthKeys)
        )
      );
  })
).pipe(Atom.withLabel('setLibraryRootsAtom'));
