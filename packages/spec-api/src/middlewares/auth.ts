import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/rpc';

import type { AuthSession } from '@repo/auth-api/shared.ts';

export class CurrentSession extends Context.Service<
  CurrentSession,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- auth middleware provides the session
  typeof AuthSession.Type
>()('@repo/spec-api/middlewares/auth/CurrentSession') {}

export class UnauthorizedError extends Schema.TaggedError<
  UnauthorizedError,
  { readonly brand: unique symbol }
>('@repo/spec-api/middlewares/auth/UnauthorizedError')('UnauthorizedError', {}) {}

export class ForbiddenError extends Schema.TaggedError<
  ForbiddenError,
  { readonly brand: unique symbol }
>('@repo/spec-api/middlewares/auth/ForbiddenError')('ForbiddenError', {}) {}

export class AuthMiddleware extends RpcMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AuthMiddleware', {
  error: UnauthorizedError,
  requiredForClient: true,
}) {}

export class AdminMiddleware extends RpcMiddleware.Service<
  AdminMiddleware,
  { requires: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AdminMiddleware', { error: ForbiddenError }) {}
