import { TRPCError, initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import * as z from 'zod';
import { ZodError } from 'zod';

import { auth } from '@/libs/auth/auth';

import { logger } from '@/logger';

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: FetchCreateContextFnOptions) => ({
  ...opts,
  session: await auth.api.getSession({ headers: opts.req.headers }),
});

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  jsonl: {
    pingMs: 1000,
  },
  sse: {
    enabled: true,
    ping: {
      enabled: true,
      intervalMs: 5000,
    },
  },
  errorFormatter({ shape, error, path, ctx }) {
    logger.error(
      `trpc(error) => %s => %s => %s`,
      path || 'Unknown path',
      ctx?.session?.user.username || 'Anonymous',
      error.message || error.cause?.message || 'Unknown error'
    );
    return {
      ...shape,
      data: {
        ...shape.data,
        description:
          error.cause && 'description' in error.cause && typeof error.cause.description === 'string'
            ? error.cause.description
            : undefined,
        zodError: error.cause instanceof ZodError ? z.flattenError(error.cause) : undefined,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await Bun.sleep(waitMs);
    logger.debug(`trpc(timingMiddleware) => %s => artificial delay of %dms added`, path, waitMs);
  }

  return next();
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session` and `ctx.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure.use(timingMiddleware).use(async (opts) => {
  if (!opts.ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action.',
    });
  }
  return opts.next({
    ctx: {
      ...opts.ctx,
      session: opts.ctx.session.session,
      user: opts.ctx.session.user,
    },
  });
});

/**
 * Admin (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to admin users, use this. It verifies
 * the session is valid and guarantees `ctx.session` and `ctx.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const adminProcedure = t.procedure.use(timingMiddleware).use(async (opts) => {
  if (!opts.ctx.session || opts.ctx.session.user.role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You must be an admin to perform this action.',
    });
  }
  return opts.next({
    ctx: {
      ...opts.ctx,
      session: opts.ctx.session.session,
      user: opts.ctx.session.user,
    },
  });
});
