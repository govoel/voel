import { Effect, FiberMap, Option, Schema } from 'effect';

import type { NativePager } from './index.ts';

const NativeInt = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 }));

export class PageRequest extends Schema.Struct({
  id: NativeInt.pipe(Schema.brand('@repo/native-paging/model/RequestId')),
  offset: NativeInt,
  limit: NativeInt.check(Schema.isGreaterThan(0)),
}) {}

export const PageResponse = <Value extends Schema.Top>(value: Value) =>
  Schema.Struct({
    items: Schema.Array(
      Schema.Struct({
        id: Schema.NonEmptyString,
        value,
      })
    ),
    total: NativeInt,
  });

export type PageResponse<Value> = ReturnType<typeof PageResponse<Schema.Codec<Value>>>['Type'];

export class PagerOptions extends Schema.Struct({
  pageSize: NativeInt.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  maxItems: NativeInt.check(Schema.isGreaterThan(0)),
  prefetchDistance: NativeInt.check(Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter(
    ({ pageSize, maxItems, prefetchDistance }) =>
      maxItems >= pageSize + 2 * prefetchDistance ||
      'maxItems must cover a page and both prefetch windows'
  )
) {}

/** Bind the native pager to scoped, request-keyed fibers. Completed pages are never cached in JS. */
export const connectPager = <Value extends Schema.JsonObject, E, R>({
  pager,
  schema,
  load,
}: {
  readonly pager: Pick<
    NativePager<NoInfer<Value>>,
    'addListener' | 'start' | 'resolve' | 'reject' | 'close'
  >;
  readonly schema: Schema.Schema<Value>;
  readonly load: (
    request: Pick<typeof PageRequest.Type, 'offset' | 'limit'>
  ) => Effect.Effect<PageResponse<NoInfer<Value>>, E, R>;
}) =>
  Effect.gen(function* () {
    const responseSchema = PageResponse(Schema.toType(schema));
    const fibers = yield* FiberMap.make<typeof PageRequest.Type.id, unknown, never>();
    const run = yield* FiberMap.runtime(fibers)<R>();
    let active = true;
    const requests = pager.addListener('request', (request) => {
      if (!active) {
        return;
      }
      run(
        request.id,
        Effect.gen(function* () {
          const decoded = yield* Schema.decodeEffect(PageRequest)(request);
          const response = yield* load(decoded);
          const page = yield* Schema.decodeEffect(responseSchema)(response);
          if (active) {
            pager.resolve(decoded.id, page.items, page.total);
          }
        }).pipe(
          Effect.catchCause(() =>
            Effect.sync(() => {
              if (active) {
                pager.reject(request.id);
              }
            })
          )
        ),
        { onlyIfMissing: true }
      );
    });
    const cancellations = pager.addListener('cancel', ({ id }) => {
      const fiber = FiberMap.getUnsafe(fibers, id);
      if (Option.isSome(fiber)) {
        fiber.value.interruptUnsafe();
      }
    });
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        active = false;
        requests.remove();
        cancellations.remove();
        pager.close();
      })
    );
    pager.start();
    return pager;
  });
