import { DateTime, Effect, Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';
import { AuthUser } from '@repo/auth-api/shared.ts';

import { activeAccountKeyAtom } from '#src/services/accounts/atoms';
import { NoActiveAccountError } from '#src/services/accounts/index.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

export const listUsersAtom = AppRuntime.pull(
  Effect.fnUntraced(
    function* (get) {
      const activeAccountKey = yield* get.result(activeAccountKeyAtom);
      if (Option.isNone(activeAccountKey)) {
        return yield* NoActiveAccountError.make();
      }
      const authClient = yield* acquireAuthClient(activeAccountKey.value);

      return Stream.paginate(
        0,
        Effect.fnUntraced(function* (offset) {
          const data = yield* authClient.admin.listUsers({
            limit: 10,
            offset,
          });

          const { users } = data;
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
    const alex = AuthUser.make({
      id: AuthUser.fields.id.make('predefined-user-alex'),
      username: AuthUser.fields.username.make('alex'),
      name: AuthUser.fields.name.make('Alex'),
      email: AuthUser.fields.email.make('alex@example.com'),
      role: AuthUser.fields.role.make('user'),
      image: AuthUser.fields.image.make(null),
      createdAt: AuthUser.fields.createdAt.make(DateTime.makeUnsafe(0)),
      updatedAt: AuthUser.fields.updatedAt.make(DateTime.makeUnsafe(0)),
    });
    const sam = AuthUser.make({
      id: AuthUser.fields.id.make('predefined-user-sam'),
      username: AuthUser.fields.username.make('sam'),
      name: AuthUser.fields.name.make('Sam'),
      email: AuthUser.fields.email.make('sam@example.com'),
      role: AuthUser.fields.role.make('user'),
      image: AuthUser.fields.image.make(null),
      createdAt: AuthUser.fields.createdAt.make(DateTime.makeUnsafe(0)),
      updatedAt: AuthUser.fields.updatedAt.make(DateTime.makeUnsafe(0)),
    });

    return [
      {
        id: PredefinedStateId.make('loading'),
        label: 'Loading',
        atom: Atom.writable(
          (): Atom.PullResult<AuthUser> => AsyncResult.initial(true),
          () => void 0
        ),
      },
      {
        id: PredefinedStateId.make('paginated'),
        label: 'Page available',
        description: 'Starts with one user and adds another when more users are requested.',
        atom: Atom.writable(
          (): Atom.PullResult<AuthUser> => AsyncResult.success({ items: [alex], done: false }),
          (context) => {
            context.setSelf(AsyncResult.success({ items: [alex, sam], done: true }));
          }
        ),
      },
      {
        id: PredefinedStateId.make('loaded'),
        label: 'All users loaded',
        atom: Atom.writable(
          (): Atom.PullResult<AuthUser> => AsyncResult.success({ items: [alex, sam], done: true }),
          () => void 0
        ),
      },
      {
        id: PredefinedStateId.make('failure'),
        label: 'No active account error',
        atom: Atom.writable(
          (): Atom.PullResult<AuthUser, NoActiveAccountError> =>
            AsyncResult.fail(NoActiveAccountError.make()),
          () => void 0
        ),
      },
    ];
  }),
  Atom.withLabel('listUsersAtom')
);
