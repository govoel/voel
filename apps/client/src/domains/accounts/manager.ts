import { Context, Effect, Layer, Redacted, Stream } from 'effect';
import { Reactivity } from 'effect/reactivity';

import {
  AuthClientMap,
  makeAuthenticationClient,
} from '#src/domains/accounts/auth-client/index.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import { AccountSignInError, AccountSignUpError } from '#src/domains/accounts/errors.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';

export class AccountManager extends Context.Service<AccountManager>()(
  'voel/domains/accounts/manager/AccountManager',
  {
    make: Effect.gen(function* () {
      const repository = yield* AccountRepository;
      const clients = yield* AuthClientMap;
      const state = repository.getActiveKey;
      const changes = state.pipe(Reactivity.stream(['account']), Stream.changes);
      const removeAccount = Effect.fnUntraced(function* (key: AccountKey) {
        // Local removal must also work when server revocation is unavailable.
        yield* clients.acquire(key).pipe(
          Effect.flatMap((client) => client.signOut),
          Effect.ignore,
          Effect.scoped
        );
        yield* repository.remove(key);
      });
      const signOutEverywhere = Effect.fnUntraced(function* (key: AccountKey) {
        const client = yield* clients.acquire(key);
        yield* client.revokeSessions;
        yield* removeAccount(key);
      }, Effect.scoped);
      const signInAccount = Effect.fnUntraced(function* ({
        serverUrl,
        username,
        password,
      }: Pick<AccountKey, 'serverUrl'> &
        Omit<Parameters<AuthClient['Service']['signIn']['username']>[0], 'password'> & {
          readonly password: Redacted.Redacted;
        }) {
        const client = yield* makeAuthenticationClient({ serverUrl });
        const result = yield* client.signIn
          .username({ username, password: Redacted.value(password) })
          .pipe(
            Effect.catchTags({
              AuthError: (error) => AccountSignInError.make({ reason: error.reason }),
            })
          );
        const key = yield* repository.upsertActive({
          serverUrl,
          userId: result.user.id,
          username: result.user.username,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          profilePicture: result.user.image,
          authStorage: client.snapshot(),
        });
        // A stable account key may already have a cached, signed-out client.
        // Refresh it from the newly committed credentials; failed network refreshes
        // do not undo a successful login or its local transaction.
        yield* clients.acquire(key).pipe(
          Effect.flatMap((current) => current.refreshSession(void 0)),
          Effect.ignore
        );
        return key;
      }, Effect.scoped);
      const setupServerWithAccount = Effect.fnUntraced(function* ({
        serverUrl,
        name,
        email,
        username,
        password,
      }: Pick<AccountKey, 'serverUrl'> &
        Omit<Parameters<AuthClient['Service']['signUp']['email']>[0], 'password'> & {
          readonly password: Redacted.Redacted;
        }) {
        const client = yield* makeAuthenticationClient({ serverUrl });
        const result = yield* client.signUp
          .email({ name, email, username, password: Redacted.value(password) })
          .pipe(
            Effect.catchTags({
              AuthError: (error) => AccountSignUpError.make({ reason: error.reason }),
            })
          );
        const key = yield* repository.upsertActive({
          serverUrl,
          userId: result.user.id,
          username: result.user.username,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          profilePicture: result.user.image,
          authStorage: client.snapshot(),
        });
        yield* clients.acquire(key).pipe(
          Effect.flatMap((current) => current.refreshSession(void 0)),
          Effect.ignore
        );
        return key;
      }, Effect.scoped);
      return {
        state,
        changes,
        setActiveAccount: repository.setActive,
        removeAccount,
        signOutEverywhere,
        signInAccount,
        setupServerWithAccount,
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);
  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AuthClientMap.layer, AccountRepository.layer])
  );
}
