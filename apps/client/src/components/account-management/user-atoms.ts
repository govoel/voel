import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';

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
