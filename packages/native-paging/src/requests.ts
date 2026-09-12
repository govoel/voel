import { Cause, Effect, FiberMap, Option, Schema } from 'effect';

import { PageRequest } from './model.ts';
import type { PageResponse } from './model.ts';

const RequestId = Schema.NonEmptyString.pipe(
  Schema.brand('@repo/native-paging/requests/RequestId')
);
export class Request extends Schema.Struct({ ...PageRequest.fields, id: RequestId }) {}

export interface PageCommands<Value> {
  readonly resolvePage: (
    page: PageResponse<Value> & { readonly id: typeof RequestId.Type }
  ) => Promise<void>;
  readonly rejectPage: (request: { readonly id: typeof RequestId.Type }) => Promise<void>;
}

/** Private, view-scoped bridge. It owns requests, never paging state or completed pages. */
export const makePageRequests = <Value extends Schema.JsonObject>() =>
  Effect.gen(function* () {
    const fibers = yield* FiberMap.make<typeof RequestId.Type>();
    const run = yield* FiberMap.runtime(fibers)();
    let active = true;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        active = false;
      })
    );

    return {
      request: <E>({
        request,
        fetchPage,
        view,
      }: {
        readonly request: typeof Request.Type;
        readonly fetchPage: (
          request: typeof PageRequest.Type
        ) => Effect.Effect<PageResponse<Value>, E>;
        readonly view: PageCommands<Value>;
      }) => {
        if (!active) {
          return;
        }
        run(
          request.id,
          Effect.gen(function* () {
            const { id, offset, limit } = yield* Schema.decodeEffect(Request)(request);
            const page = yield* fetchPage({ offset, limit });
            if (active) {
              yield* Effect.tryPromise(async () => view.resolvePage({ id, ...page }));
            }
          }).pipe(
            Effect.catchCause((cause) => {
              if (!active || Cause.hasInterruptsOnly(cause)) {
                return Effect.void;
              }
              return Effect.gen(function* () {
                yield* Effect.logWarning('Native page request failed', cause);
                yield* Effect.tryPromise(async () => view.rejectPage({ id: request.id }));
              }).pipe(Effect.catchCause(Effect.logWarning));
            })
          ),
          { onlyIfMissing: true }
        );
      },
      cancel: ({ id }: { readonly id: typeof RequestId.Type }) => {
        const fiber = FiberMap.getUnsafe(fibers, id);
        if (Option.isSome(fiber)) {
          fiber.value.interruptUnsafe();
        }
      },
    };
  });

export type NativePageRequest = typeof Request.Type;
