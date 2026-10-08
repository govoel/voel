/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import { Auth, Sessions } from '@yielded/auth';
import { layerWebCrypto } from '@yielded/crypto/WebCrypto';
import { DateTime, Effect, Layer, Redacted } from 'effect';

import { AlreadyBootstrapped } from '@repo/spec-api/auth/contract.ts';

import { AccountMethods, AppAuth } from '#src/services/auth/app.ts';

// These tests exercise contract dispatch, not the session storage implementation.
const unexpectedSessionCall = () => Effect.die('Unexpected session storage call');
const TestSessions = Layer.mergeAll(
  layerWebCrypto,
  Layer.succeed(AppAuth.sessions.StatefulSessionPersistence, {
    establish: unexpectedSessionCall,
    verify: unexpectedSessionCall,
    rotate: unexpectedSessionCall,
    revokeDigest: unexpectedSessionCall,
    revoke: unexpectedSessionCall,
    revokeAll: unexpectedSessionCall,
  }),
  Layer.succeed(AppAuth.sessions.SessionRepository, { list: unexpectedSessionCall }),
  Layer.succeed(Sessions.AuthenticationAuthority, {
    capture: unexpectedSessionCall,
    requirements: unexpectedSessionCall,
    approve: unexpectedSessionCall,
  })
);

it.describe('AppAuth', () => {
  it.effect(
    'dispatches username sign-in with redacted input and private credential delivery',
    Effect.fnUntraced(function* () {
      const expiresAt = DateTime.makeUnsafe('2030-01-01T00:00:00Z');
      const credential = Redacted.make('private-pending-credential');
      const methods = AccountMethods.of({
        signIn: (input) => {
          expect(input.username).toBe('admin');
          expect(Redacted.value(input.password)).toBe('secret');
          return Effect.succeed({
            value: { _tag: 'PendingAuthentication', expiresAt },
            credentialCommands: [
              {
                _tag: 'Issue',
                slot: 'pending-proof',
                credential,
                expiresAtMillis: DateTime.toEpochMillis(expiresAt),
              },
            ],
          });
        },
        bootstrapServer: () => Effect.die('Unexpected bootstrap call'),
      });
      const auth = yield* AppAuth.make.pipe(
        Effect.provide([TestSessions, Layer.succeed(AccountMethods, methods)])
      );
      const commands: Array<Parameters<Auth.AuthRequest['Service']['credentialCommandSink']>[0]> =
        [];

      const result = yield* auth.passwordSignIn({ username: 'admin', password: 'secret' }).pipe(
        Effect.provideService(Auth.AuthRequest, {
          invocation: { _tag: 'Guest' },
          credentials: {},
          credentialCommandSink: (value) =>
            Effect.sync(() => {
              commands.push(value);
            }),
        })
      );

      expect(result).toEqual({ _tag: 'PendingAuthentication', expiresAt });
      expect(commands.flat()).toEqual([
        {
          _tag: 'Issue',
          slot: 'pending-proof',
          credential,
          expiresAtMillis: DateTime.toEpochMillis(expiresAt),
        },
      ]);
    }, Effect.scoped)
  );

  it.effect(
    'dispatches bootstrap and preserves the already-initialized error',
    Effect.fnUntraced(function* () {
      const input = {
        displayName: 'Admin',
        username: 'admin',
        email: 'ADMIN@example.com',
        password: 'secret',
      };
      let bootstrapped = false;
      const methods = AccountMethods.of({
        signIn: () => Effect.die('Unexpected sign-in call'),
        bootstrapServer: (request) => {
          expect(request.displayName).toBe('Admin');
          expect(request.username).toBe('admin');
          expect(request.email).toBe('admin@example.com');
          expect(Redacted.value(request.password)).toBe('secret');
          if (bootstrapped) {
            return AlreadyBootstrapped.make({});
          }
          return Effect.succeed({ _tag: 'BootstrapSuccess' });
        },
      });
      const auth = yield* AppAuth.make.pipe(
        Effect.provide([TestSessions, Layer.succeed(AccountMethods, methods)])
      );
      const request = Auth.AuthRequest.of({
        invocation: { _tag: 'Guest' },
        credentials: {},
        credentialCommandSink: () => Effect.die('Bootstrap must not issue credentials'),
      });

      const result = yield* auth
        .bootstrapServer(input)
        .pipe(Effect.provideService(Auth.AuthRequest, request));
      expect(result).toEqual({ _tag: 'BootstrapSuccess' });
      bootstrapped = true;

      const retry = yield* auth
        .bootstrapServer(input)
        .pipe(Effect.provideService(Auth.AuthRequest, request), Effect.result);
      expect(retry).toMatchObject({ _tag: 'Failure', failure: { _tag: 'AlreadyBootstrapped' } });
    }, Effect.scoped)
  );
});
