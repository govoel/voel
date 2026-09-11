import { describe, expect, it } from 'bun:test';

import { Deferred, Effect, Schema } from 'effect';

import { PageRequest, PageResponse, connectPager } from './model.ts';

const makePager = () => {
  const listeners = new Map<string, Set<(request: typeof PageRequest.Type) => void>>();
  const resolved: Array<typeof PageRequest.Type.id> = [];
  const rejected: Array<typeof PageRequest.Type.id> = [];
  let starts = 0;
  let closes = 0;
  const addListener: Parameters<typeof connectPager>[0]['pager']['addListener'] = (
    name,
    listener
  ) => {
    const callbacks = listeners.get(name) ?? new Set();
    const callback = (request: typeof PageRequest.Type) => {
      listener(request);
    };
    callbacks.add(callback);
    listeners.set(name, callbacks);
    return {
      remove: () => {
        callbacks.delete(callback);
      },
    };
  };
  return {
    addListener,
    start: () => {
      starts += 1;
    },
    close: () => {
      closes += 1;
    },
    resolve: (id: typeof PageRequest.Type.id) => {
      resolved.push(id);
    },
    reject: (id: typeof PageRequest.Type.id) => {
      rejected.push(id);
    },
    emit: (name: 'request' | 'cancel', id: number) => {
      const request = PageRequest.make({
        id: PageRequest.fields.id.make(id),
        offset: 0,
        limit: 50,
      });
      for (const listener of listeners.get(name) ?? []) {
        listener(request);
      }
    },
    resolved,
    rejected,
    counts: () => ({ starts, closes }),
  };
};

const page = PageResponse.make({
  items: [{ id: 'user', value: { username: 'reader' } }],
  total: 1,
});

describe('native paging transport', () => {
  it('deduplicates in-flight requests and releases completed request fibers', async () => {
    const pager = makePager();
    let loads = 0;
    await Effect.gen(function* () {
      const response = yield* Deferred.make<typeof PageResponse.Type>();
      const started = yield* Deferred.make<true>();
      yield* connectPager({
        pager,
        load: () =>
          Effect.gen(function* () {
            loads += 1;
            yield* Deferred.succeed(started, true);
            return yield* Deferred.await(response);
          }),
      });
      pager.emit('request', 1);
      pager.emit('request', 1);
      yield* Deferred.await(started);
      expect(loads).toBe(1);
      yield* Deferred.succeed(response, page);
      yield* Effect.yieldNow;
      expect(pager.resolved).toEqual([PageRequest.fields.id.make(1)]);
    }).pipe(Effect.scoped, Effect.runPromise);
    expect(pager.counts()).toEqual({ starts: 1, closes: 1 });
  });

  it('interrupts canceled loads and closes all outstanding work with the owning scope', async () => {
    const pager = makePager();
    let interrupted = 0;
    await Effect.gen(function* () {
      const started = yield* Deferred.make<true>();
      yield* connectPager({
        pager,
        load: () =>
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                interrupted += 1;
              })
            );
            yield* Deferred.succeed(started, true);
            return yield* Effect.never;
          }).pipe(Effect.scoped),
      });
      pager.emit('request', 1);
      yield* Deferred.await(started);
      pager.emit('cancel', 1);
      yield* Effect.yieldNow;
      expect(interrupted).toBe(1);
      pager.emit('request', 2);
      yield* Effect.yieldNow;
    }).pipe(Effect.scoped, Effect.runPromise);
    expect(interrupted).toBe(2);
    pager.emit('request', 3);
    expect(pager.resolved).toEqual([]);
    expect(pager.rejected).toEqual([]);
    expect(pager.counts().closes).toBe(1);
  });

  it('reports a load failure without retaining a page or ending the session', async () => {
    const pager = makePager();
    await Effect.gen(function* () {
      let fail = true;
      yield* connectPager({
        pager,
        load: () => (fail ? Effect.fail('offline') : Effect.succeed(page)),
      });
      pager.emit('request', 1);
      yield* Effect.yieldNow;
      expect(pager.rejected).toEqual([PageRequest.fields.id.make(1)]);
      fail = false;
      pager.emit('request', 2);
      yield* Effect.yieldNow;
      expect(pager.resolved).toEqual([PageRequest.fields.id.make(2)]);
    }).pipe(Effect.scoped, Effect.runPromise);
    expect(Schema.decodeOption(PageResponse)({ items: page.items, total: -1 })._tag).toBe('None');
  });
});
