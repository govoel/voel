import { Effect, Option } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';
import type { PageRequest } from '@repo/native-paging/model';

import { activeAccountKeyAtom } from '#src/services/accounts/atoms';
import { NoActiveAccountError } from '#src/services/accounts/index.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export type ServerUser = Pick<typeof AuthUser.Type, 'username'>;

export const usersPageLoaderAtom = AppRuntime.atom((get) =>
  Effect.gen(function* () {
    const account = yield* get.result(activeAccountKeyAtom, { suspendOnWaiting: true });
    if (Option.isNone(account)) {
      return yield* NoActiveAccountError.make();
    }
    const client = yield* acquireAuthClient(account.value);
    const fetchPage = Effect.fnUntraced(function* (request: typeof PageRequest.Type) {
      const page = yield* client.admin.listUsers(request);
      return {
        items: page.users.map(({ id, username }) => ({ id, value: { username } })),
        total: page.total,
      };
    });
    return { key: account.value.authStorageId, fetchPage };
  })
).pipe(
  Atom.setIdleTTL(0),
  // Hide the previous account's loader while acquiring its replacement.
  Atom.map((result) => (result.waiting ? AsyncResult.initial(true) : result)),
  Atom.setIdleTTL(0),
  Atom.withLabel('usersPageLoaderAtom')
);
