import { Effect, Option, Schema, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { activeAccountAtom } from '#src/services/accounts/atoms';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import {
  NoActiveAccountError,
  authClientRequest,
  getAuthClient,
} from '#src/services/auth-client/index.ts';
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
    function* (get) {
      const activeAccount = yield* get
        .result(activeAccountAtom)
        .pipe(Effect.catchTag('NoSuchElementError', () => Effect.succeed(Option.none())));
      if (Option.isNone(activeAccount)) {
        return yield* new NoActiveAccountError();
      }
      const authClient = yield* getAuthClient(activeAccount.value.account);

      return Stream.paginate(
        0,
        Effect.fnUntraced(function* (offset) {
          const data = yield* authClientRequest(async () =>
            authClient.admin.listUsers({
              query: {
                limit: 10,
                offset,
              },
            })
          );

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
  swr({ staleTime: 10_000, revalidateOnMount: true, revalidateOnFocus: true }),
  withPredefinedStates(() => {
    const alex = new ServerUser({ id: 'predefined-user-alex', username: 'alex' });
    const sam = new ServerUser({ id: 'predefined-user-sam', username: 'sam' });

    return [
      {
        id: 'loading',
        label: 'Loading',
        atom: Atom.writable(
          (): Atom.PullResult<ServerUser> => AsyncResult.initial(true),
          () => void 0
        ),
      },
      {
        id: 'paginated',
        label: 'Page available',
        description: 'Starts with one user and adds another when more users are requested.',
        atom: Atom.writable(
          (): Atom.PullResult<ServerUser> => AsyncResult.success({ items: [alex], done: false }),
          (context) => {
            context.setSelf(AsyncResult.success({ items: [alex, sam], done: true }));
          }
        ),
      },
      {
        id: 'loaded',
        label: 'All users loaded',
        atom: Atom.writable(
          (): Atom.PullResult<ServerUser> =>
            AsyncResult.success({ items: [alex, sam], done: true }),
          () => void 0
        ),
      },
      {
        id: 'failure',
        label: 'No active account error',
        atom: Atom.writable(
          (): Atom.PullResult<ServerUser, NoActiveAccountError> =>
            AsyncResult.fail(new NoActiveAccountError()),
          () => void 0
        ),
      },
    ];
  }),
  Atom.withLabel('listUsersAtom')
);
