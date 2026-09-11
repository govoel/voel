import { Effect, Option } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { PageRequest } from '@repo/native-paging/model';

import { activeAccountKeyAtom } from '#src/services/accounts/atoms';
import { NoActiveAccountError } from '#src/services/accounts/index.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const usersPageLoaderAtom = AppRuntime.atom((get) =>
  Effect.gen(function* () {
    const account = yield* get.result(activeAccountKeyAtom, { suspendOnWaiting: true });
    if (Option.isNone(account)) {
      return yield* NoActiveAccountError.make();
    }
    const client = yield* acquireAuthClient(account.value);
    return Effect.fnUntraced(function* (
      request: Pick<typeof PageRequest.Type, 'offset' | 'limit'>
    ) {
      const page = yield* client.admin.listUsers(request);
      return {
        items: page.users.map(({ id, username }) => ({ id, value: { username } })),
        total: page.total,
      };
    });
  })
).pipe(Atom.setIdleTTL(0), Atom.withLabel('usersPageLoaderAtom'));
