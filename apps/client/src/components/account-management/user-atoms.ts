import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type {
  AuthAdminRevokeSessionInput,
  AuthAdminUpdateUserInput,
  AuthBanUserInput,
  AuthCreateUserInput,
  AuthSetRoleInput,
  AuthSetUserPasswordInput,
  AuthUser,
  AuthUserIdInput,
} from '@repo/auth-api/shared.ts';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { accountAuthAtom } from '#src/components/account-management/atoms.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

export const serverUserAtom = Atom.family((userId: typeof AuthUser.fields.id.Type) =>
  AppRuntime.atom(
    Effect.fnUntraced(function* (get) {
      const { client } = yield* get.result(accountAuthAtom);
      return yield* client.admin.getUser({ userId });
    })
  ).pipe(swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true }))
);

export const createServerUserAtom = AppRuntime.fn<typeof AuthCreateUserInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    const result = yield* client.admin.createUser(input);
    get.refresh(listUsersAtom);
    return result;
  })
);

export const setServerUserRoleAtom = AppRuntime.fn<typeof AuthSetRoleInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.admin.setRole(input);
    get.refresh(serverUserAtom(input.userId));
    get.refresh(listUsersAtom);
  })
);

export const updateServerUserAtom = AppRuntime.fn<typeof AuthAdminUpdateUserInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.admin.updateUser(input);
    get.refresh(serverUserAtom(input.userId));
    get.refresh(listUsersAtom);
  })
);

export const setServerUserPasswordAtom = AppRuntime.fn<typeof AuthSetUserPasswordInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.admin.setUserPassword({ userId: input.userId, newPassword: input.newPassword });
  })
);

export const banServerUserAtom = AppRuntime.fn<typeof AuthBanUserInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.admin.banUser(input);
    get.refresh(serverUserSessionsAtom(input.userId));
    get.refresh(serverUserAtom(input.userId));
    get.refresh(listUsersAtom);
  })
);
export const unbanServerUserAtom = AppRuntime.fn<typeof AuthUserIdInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.admin.unbanUser(input);
    get.refresh(serverUserAtom(input.userId));
    get.refresh(listUsersAtom);
  })
);

export const deleteServerUserAtom = AppRuntime.fn<typeof AuthUserIdInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.admin.removeUser(input);
    get.refresh(listUsersAtom);
    get.refresh(serverUserAtom(input.userId));
  })
);

export const serverUserSessionsAtom = Atom.family((userId: typeof AuthUser.fields.id.Type) =>
  AppRuntime.atom(
    Effect.fnUntraced(function* (get) {
      const { client } = yield* get.result(accountAuthAtom);
      return yield* client.admin.listUserSessions({ userId });
    })
  ).pipe(swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true }))
);

export const revokeServerUserSessionAtom = Atom.family((userId: typeof AuthUser.fields.id.Type) =>
  AppRuntime.fn<typeof AuthAdminRevokeSessionInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const { client } = yield* get.result(accountAuthAtom);
      yield* client.admin.revokeUserSession(input);
      get.refresh(serverUserSessionsAtom(userId));
    })
  )
);
export const revokeServerUserSessionsAtom = AppRuntime.fn<typeof AuthUserIdInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.admin.revokeUserSessions(input);
    get.refresh(serverUserSessionsAtom(input.userId));
  })
);
