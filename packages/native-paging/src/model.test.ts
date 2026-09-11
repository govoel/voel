import { describe, expect, it } from 'bun:test';

import { Deferred, Effect, Schema } from 'effect';

import { PageRequest, PageResponse, connectPager } from './model.ts';

class User extends Schema.Struct({ username: Schema.NonEmptyString }) {}
const UsersPage = PageResponse(User);

const makePager = () => {
  const listeners = new Map<string, Set<(request: typeof PageRequest.Type) => void>>();
  const resolved: Array<typeof PageRequest.Type.id> = [];
  const rejected: Array<typeof PageRequest.Type.id> = [];
  const pages: Array<typeof UsersPage.Type> = [];
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
    resolve: (
      id: typeof PageRequest.Type.id,
      items: typeof UsersPage.Type.items,
      total: typeof UsersPage.Type.total
    ) => {
      resolved.push(id);
      pages.push({ items, total });
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
    pages,
    counts: () => ({ starts, closes }),
  };
};

const page = UsersPage.make({
  items: [{ id: 'user', value: { username: 'reader' } }],
  total: 1,
});

describe('native paging transport', () => {
  it('deduplicates in-flight requests and releases completed request fibers', async () => {
    const pager = makePager();
    let loads = 0;
    await Effect.gen(function* () {
      const response = yield* Deferred.make<typeof UsersPage.Type>();
      const started = yield* Deferred.make<true>();
      yield* connectPager({
        pager,
        schema: User,
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
      expect(pager.pages).toEqual([page]);
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
        schema: User,
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
        schema: User,
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
    expect(Schema.decodeOption(UsersPage)({ items: page.items, total: -1 })._tag).toBe('None');
  });

  it('rejects invalid feature payloads before delivering any rows and accepts a retry', async () => {
    const pager = makePager();
    await Effect.gen(function* () {
      let response = { items: [{ id: 'user', value: { username: '' } }], total: 1 };
      yield* connectPager({ pager, schema: User, load: () => Effect.succeed(response) });
      pager.emit('request', 1);
      yield* Effect.yieldNow;
      expect(pager.rejected).toEqual([PageRequest.fields.id.make(1)]);
      expect(pager.pages).toEqual([]);
      response = { items: [...page.items], total: page.total };
      pager.emit('request', 2);
      yield* Effect.yieldNow;
      expect(pager.pages).toEqual([page]);
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('turns synchronous native decoding errors into retryable request failures', async () => {
    const pager = makePager();
    await Effect.gen(function* () {
      let fail = true;
      yield* connectPager({
        pager: {
          ...pager,
          resolve: (...args) => {
            if (fail) {
              throw new Error('Invalid native user payload');
            }
            pager.resolve(...args);
          },
        },
        schema: User,
        load: () => Effect.succeed(page),
      });
      pager.emit('request', 1);
      yield* Effect.yieldNow;
      expect(pager.rejected).toEqual([PageRequest.fields.id.make(1)]);
      expect(pager.pages).toEqual([]);
      fail = false;
      pager.emit('request', 2);
      yield* Effect.yieldNow;
      expect(pager.pages).toEqual([page]);
    }).pipe(Effect.scoped, Effect.runPromise);
  });
});
