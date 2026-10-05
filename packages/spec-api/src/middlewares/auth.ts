import { Context, Effect, Schema } from 'effect';
import { HttpApiMiddleware } from 'effect/http-api';

import type { AuthSession } from '@repo/auth-api/shared.ts';

export class CurrentSession extends Context.Service<CurrentSession>()(
  '@repo/spec-api/middlewares/auth/CurrentSession',
  { make: (session: typeof AuthSession.Type) => Effect.succeed(session) }
) {}

export class UnauthorizedError extends Schema.TaggedError<
  UnauthorizedError,
  { readonly brand: unique symbol }
>('@repo/spec-api/middlewares/auth/UnauthorizedError')(
  'UnauthorizedError',
  {},
  { httpApiStatus: 401 }
) {}

export class ForbiddenError extends Schema.TaggedError<
  ForbiddenError,
  { readonly brand: unique symbol }
>('@repo/spec-api/middlewares/auth/ForbiddenError')('ForbiddenError', {}, { httpApiStatus: 403 }) {}

export class AuthMiddleware extends HttpApiMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AuthMiddleware', {
  error: UnauthorizedError,
  requiredForClient: true,
}) {}

export class AdminMiddleware extends HttpApiMiddleware.Service<
  AdminMiddleware,
  { requires: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AdminMiddleware', { error: ForbiddenError }) {}
