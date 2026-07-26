import { Effect, Option, Schema, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { CurrentAuthClient } from '#src/services/auth-client/current';
import { AppRuntime } from '#src/services/registry';

export class ServerUser extends Schema.Class<ServerUser, { readonly brand: unique symbol }>(
  'ServerUser'
)({
  id: Schema.String,
  username: Schema.String,
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);

  public static readonly decodeUnknownArrayEffect = Schema.decodeUnknownEffect(Schema.Array(this));
}

export const makeListUsersAtom = (runtime: Atom.AtomRuntime<CurrentAuthClient>) => ({
  listUsersAtom: runtime
    .pull(
      Effect.fnUntraced(
        function* () {
          const currentAuthClient = yield* CurrentAuthClient;
          return Stream.paginate(
            0,
            Effect.fnUntraced(function* (offset) {
              const data = yield* currentAuthClient.admin.listUsers({
                query: {
                  limit: 10,
                  offset,
                },
              });

              const users = yield* ServerUser.decodeUnknownArrayEffect(data.users);
              const nextOffset = offset + users.length;
              const hasMore = users.length > 0 && nextOffset < data.total;

              return [users, hasMore ? Option.some(nextOffset) : Option.none()] as const;
            })
          );
        },
        (effect) => Stream.unwrap(effect)
      )
    )
    .pipe(Atom.swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true })),
});

export const { listUsersAtom } = makeListUsersAtom(AppRuntime);
