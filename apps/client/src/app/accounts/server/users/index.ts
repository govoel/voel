import { Effect, Option, Schema, Stream } from 'effect';

import { activeAccountAtom, activeAuthClientLayer } from '#src/services/accounts/atoms.ts';
import { AuthClient } from '#src/services/auth-client/service.ts';
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

export const listUsersAtom = AppRuntime.pull((get) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const authClient = yield* AuthClient;
      return Stream.paginate(
        0,
        Effect.fnUntraced(function* (offset) {
          const data = yield* authClient.admin.listUsers({
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
    })
  ).pipe(Stream.provide(activeAuthClientLayer(get.result(activeAccountAtom))))
).pipe(swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true }));
