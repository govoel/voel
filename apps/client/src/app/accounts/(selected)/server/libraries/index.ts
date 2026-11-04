import { Array, Effect, Option, Stream } from 'effect';
import { Atom } from 'effect/reactivity';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

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
          const page = yield* client.library.list({ query: { cursor, limit: 10 } });
          return [
            [page],
            Option.isSome(page.nextCursor) ? Option.some(page.nextCursor) : Option.none(),
          ] as const;
        })
      );
    }, Stream.unwrap)
  ).pipe(
    Atom.mapResult(({ items: pages }) => ({
      items: Array.flatMap(pages, (page) => page.items),
      done: Option.isNone(Array.lastNonEmpty(pages).nextCursor),
    })),
    Atom.withReactivity(['library']),
    swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true })
  )
);
