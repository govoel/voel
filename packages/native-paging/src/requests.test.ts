import { describe, expect, it } from 'bun:test';

import { Deferred, Effect, Exit, Scope } from 'effect';

import { PagingOptions } from './model.ts';
import { Request, makePageRequests } from './requests.ts';
import type { PageCommands } from './requests.ts';

const page = { items: [{ id: 'user', value: { username: 'reader' } }], total: 1 };
type User = (typeof page)['items'][number]['value'];
const request = (id: string) =>
  Request.make({ id: Request.fields.id.make(id), offset: 0, limit: 50 });
const makeView = () => {
  const resolved: Array<Parameters<PageCommands<User>['resolvePage']>[0]> = [];
  const rejected: Array<Parameters<PageCommands<User>['rejectPage']>[0]> = [];
  return {
    resolved,
    rejected,
    resolvePage: async (delivery: Parameters<PageCommands<User>['resolvePage']>[0]) => {
      resolved.push(delivery);
    },
    rejectPage: async (cancellation: Parameters<PageCommands<User>['rejectPage']>[0]) => {
      rejected.push(cancellation);
    },
  };
};

describe('view page requests', () => {
  it('deduplicates in-flight requests and sends only pagination parameters to the loader', async () => {
    const view = makeView();
    let loads = 0;
    await Effect.gen(function* () {
      const requests = yield* makePageRequests<User>();
      const response = yield* Deferred.make<typeof page>();
      const started = yield* Deferred.make<true>();
      const fetchPage = (params: { readonly offset: number; readonly limit: number }) =>
        Effect.gen(function* () {
          expect(params).toEqual({ offset: 0, limit: 50 });
          loads += 1;
          yield* Deferred.succeed(started, true);
          return yield* Deferred.await(response);
        });
      requests.request({ request: request('view:1'), fetchPage, view });
      requests.request({ request: request('view:1'), fetchPage, view });
      yield* Deferred.await(started);
      expect(loads).toBe(1);
      yield* Deferred.succeed(response, page);
      yield* Effect.yieldNow;
      expect(view.resolved).toEqual([{ id: Request.fields.id.make('view:1'), ...page }]);
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('cancels native-invalidated requests and unmounted work without rejecting cancellation', async () => {
    const view = makeView();
    let interrupted = 0;
    const fetchPage = () =>
      Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted += 1;
          })
        )
      );
    await Effect.gen(function* () {
      const requests = yield* makePageRequests<User>();
      requests.request({ request: request('view:1'), fetchPage, view });
      yield* Effect.yieldNow;
      requests.cancel(request('view:1'));
      yield* Effect.yieldNow;
      expect(interrupted).toBe(1);
      requests.request({ request: request('view:2'), fetchPage, view });
      yield* Effect.yieldNow;
    }).pipe(Effect.scoped, Effect.runPromise);
    expect(interrupted).toBe(2);
    expect(view.resolved).toEqual([]);
    expect(view.rejected).toEqual([]);
  });

  it('rejects loader and asynchronous native decode failures, then accepts a retry', async () => {
    const view = makeView();
    await Effect.gen(function* () {
      const requests = yield* makePageRequests<User>();
      requests.request({
        request: request('view:1'),
        fetchPage: () => Effect.fail({ _tag: 'LoadFailed' as const }),
        view,
      });
      yield* Effect.yieldNow;
      expect(view.resolved).toEqual([]);
      expect(view.rejected).toEqual([{ id: Request.fields.id.make('view:1') }]);
      requests.request({
        request: request('view:2'),
        fetchPage: () => Effect.succeed(page),
        view: {
          ...view,
          resolvePage: async () => {
            throw new Error('Native decoding failed');
          },
        },
      });
      yield* Effect.yieldNow;
      expect(view.rejected).toEqual([
        { id: Request.fields.id.make('view:1') },
        { id: Request.fields.id.make('view:2') },
      ]);
      requests.request({ request: request('view:3'), fetchPage: () => Effect.succeed(page), view });
      yield* Effect.yieldNow;
      expect(view.resolved).toEqual([{ id: Request.fields.id.make('view:3'), ...page }]);
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('ignores stale callbacks after their view scope closes', async () => {
    const view = makeView();
    let loads = 0;
    await Effect.gen(function* () {
      const scope = yield* Scope.make();
      const requests = yield* makePageRequests<User>().pipe(Scope.provide(scope));
      yield* Scope.close(scope, Exit.void);
      requests.request({
        request: request('old-view:1'),
        fetchPage: () =>
          Effect.sync(() => {
            loads += 1;
            return page;
          }),
        view,
      });
      yield* Effect.yieldNow;
    }).pipe(Effect.runPromise);
    expect(loads).toBe(0);
    expect(view.resolved).toEqual([]);
  });

  it('validates resident-window options without imposing an endpoint-specific page-size cap', () => {
    expect(PagingOptions.make({ pageSize: 200, maxResidentItems: 600 }).pageSize).toBe(200);
    expect(() => PagingOptions.make({ pageSize: 50, maxResidentItems: 100 })).toThrow();
  });
});
