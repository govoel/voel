import { Context, Effect, Schema } from 'effect';
import { HttpApiMiddleware, HttpApiSchema } from 'effect/http-api';

import type { AuthSession } from '@repo/auth-api/shared.ts';

export class CurrentSession extends Context.Service<CurrentSession>()(
  '@repo/spec-api/middlewares/auth/CurrentSession',
  { make: (session: typeof AuthSession.Type) => Effect.succeed(session) }
) {}

export class UnauthorizedError extends Schema.TaggedError<
  UnauthorizedError,
  { readonly brand: unique symbol }
>('@repo/spec-api/middlewares/auth/UnauthorizedError')('UnauthorizedError', {}) {}

export class ForbiddenError extends Schema.TaggedError<
  ForbiddenError,
  { readonly brand: unique symbol }
>('@repo/spec-api/middlewares/auth/ForbiddenError')('ForbiddenError', {}) {}

export class AuthMiddleware extends HttpApiMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AuthMiddleware', {
  error: UnauthorizedError.pipe(HttpApiSchema.status(401)),
  requiredForClient: true,
}) {}

export class AdminMiddleware extends HttpApiMiddleware.Service<
  AdminMiddleware,
  { requires: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AdminMiddleware', {
  error: ForbiddenError.pipe(HttpApiSchema.status(403)),
}) {}
