import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

import type { Session } from '@repo/auth-api/server.ts';

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  '@repo/spec-api/middlewares/auth/CurrentSession'
) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  '@repo/spec-api/middlewares/auth/Unauthorized',
  {}
) {}

export class AuthMiddleware extends RpcMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AuthMiddleware', {
  error: Unauthorized,
  requiredForClient: true,
}) {}

export class AdminMiddleware extends RpcMiddleware.Service<
  AdminMiddleware,
  { requires: CurrentSession }
>()('@repo/spec-api/middlewares/auth/AdminMiddleware', { error: Unauthorized }) {}
