import { expect, it } from '@effect/vitest';
import { AuthContract } from '@yielded/auth';
import { HttpApi } from 'effect/http-api';

import { AuthApi } from '@repo/spec-api/auth/contract.ts';

import { makeAppAuth } from '#src/services/auth/app.ts';

it('projects only bootstrap, email sign-in and the intended session actions', () => {
  const AppAuth = makeAppAuth({ resetUrl: 'https://auth.test/reset' });
  const actions = [
    'bootstrapServer',
    'passwordSignIn',
    'getSession',
    'requireSession',
    'renewSession',
    'signOut',
  ];
  expect(Object.keys(AuthApi.actions)).toEqual(actions);
  const api = HttpApi.make('AuthTest').add(AuthContract.httpGroup(AuthApi));
  expect(Object.keys(api.groups.auth.endpoints)).toEqual(actions);
  expect(AuthApi.sessions.Session).toBeDefined();
  expect(AppAuth.strategies.password.operations.Register).toBeDefined();
  expect(AuthApi.actions.bootstrapServer.method).toBe('register');
});
