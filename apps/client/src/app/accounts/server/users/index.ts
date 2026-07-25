import { Effect, Option, Schema, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { CurrentAuthClient } from '#src/services/auth-client/current';
import { AppRuntime } from '#src/services/registry';

export class ServerUser extends Schema.Class<ServerUser, { readonly brand: unique symbol }>(
  'voel/app/accounts/server/users/ServerUser'
)({
  id: Schema.String,
  username: Schema.String,
}) {}

const decodeServerUsers = Schema.decodeUnknownEffect(Schema.Array(ServerUser));

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

              const users = yield* decodeServerUsers(data.users);
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
