import { Context } from 'effect';
import { HttpApiError, HttpApiMiddleware, HttpApiSecurity } from 'effect/unstable/httpapi';

import type { Session } from '@repo/auth-api/server.ts';

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  '@repo/spec-api/auth/CurrentSession'
) {}

export class AuthMiddleware extends HttpApiMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()('@repo/spec-api/auth/AuthMiddleware', {
  security: {
    cookie: HttpApiSecurity.apiKey({ in: 'cookie', key: 'auth.session_token' }),
  },
  error: HttpApiError.UnauthorizedNoContent,
}) {}
