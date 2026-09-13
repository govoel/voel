import { Effect } from 'effect';

import type { AuthChangePasswordInput, AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';

import { accountAuthAtom } from '#src/features/accounts/shared/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

export const changePasswordAtom = AppRuntime.fn<typeof AuthChangePasswordInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
  })
);

export const ownSessionsAtom = AppRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const { client } = yield* get.result(accountAuthAtom);
    const current = yield* client.readSession;
    const sessions = yield* client.listSessions;
    return { sessions, currentId: current.session.id };
  })
).pipe(swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true }));

export const revokeOwnSessionAtom = AppRuntime.fn<typeof AuthRevokeSessionInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.revokeSession(input);
    get.refresh(ownSessionsAtom);
  })
);

export const signOutEverywhereAtom = AppRuntime.fn<null>()(
  Effect.fnUntraced(function* (_, get) {
    const { key } = yield* get.result(accountAuthAtom);
    const manager = yield* AccountManager;
    yield* manager.signOutEverywhere(key);
  })
);
