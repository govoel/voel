import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

import type { Session } from '@repo/auth-api/server.ts';

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  '@repo/spec-api/middlewares/auth/CurrentSession'
) {}

export class UnauthorizedError extends Schema.TaggedErrorClass<
  UnauthorizedError,
  { readonly brand: unique symbol }
>('@repo/spec-api/middlewares/auth/UnauthorizedError')('UnauthorizedError', {}) {}

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
>()('@repo/spec-api/middlewares/auth/AdminMiddleware', { error: UnauthorizedError }) {}
