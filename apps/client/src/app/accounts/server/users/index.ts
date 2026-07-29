import { Effect, Option, Schema, Stream } from 'effect';

import { CurrentAuthClient } from '#src/services/auth-client/current';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

export class ServerUser extends Schema.Class<ServerUser, { readonly brand: unique symbol }>(
  'voel/app/accounts/server/users/index/ServerUser'
)({
  id: Schema.String,
  username: Schema.String,
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);

  public static readonly decodeUnknownArrayEffect = Schema.decodeUnknownEffect(Schema.Array(this));
}

export const listUsersAtom = AppRuntime.pull(
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
).pipe(
  swr({
    staleTime: 10_000,
    revalidateOnMount: true,
    revalidateOnFocus: true,
  })
);
