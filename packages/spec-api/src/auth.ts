import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

import type { Session } from '@repo/auth-api/server.ts';

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  '@repo/spec-api/auth/CurrentSession'
) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  '@repo/spec-api/auth/Unauthorized',
  {}
) {}

export class AuthMiddleware extends RpcMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()('@repo/spec-api/auth/AuthMiddleware', {
  error: Unauthorized,
}) {}
