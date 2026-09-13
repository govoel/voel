import { Effect, Option } from 'effect';

import { activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import { NoActiveAccountError } from '#src/services/accounts/index.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const accountAuthAtom = AppRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const key = yield* get.result(activeAccountKeyAtom);
    if (Option.isNone(key)) {
      return yield* NoActiveAccountError.make();
    }
    return { key: key.value, client: yield* acquireAuthClient(key.value) };
  })
);
