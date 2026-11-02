import { Context, Effect, Layer, LayerMap, Option } from 'effect';
import { FetchHttpClient, HttpClientError, HttpClientRequest } from 'effect/http';
import { HttpApiClient, HttpApiMiddleware } from 'effect/http-api';

import { Api } from '@repo/spec-api';
import { AuthMiddleware, UnauthorizedError } from '@repo/spec-api/domains/auth/http.ts';

import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';

/** The shared API contract, authenticated as one specific account. */
export class ApiClient extends Context.Service<ApiClient>()('voel/api-client/ApiClient', {
  make: Effect.fnUntraced(function* (account: AccountKey) {
    const authentication = yield* AuthClientMap.use((clients) => clients.acquire(account));
    const middleware = yield* Layer.build(
      HttpApiMiddleware.layerClient(
        AuthMiddleware,
        Effect.fnUntraced(function* ({ next, request }) {
          const cookie = yield* authentication.getCookie.pipe(
            Effect.catchTag('AuthClientGetCookieError', (cause) =>
              Effect.fail(
                new HttpClientError.HttpClientError({
                  reason: new HttpClientError.TransportError({
                    request,
                    cause,
                    description: 'Failed to read account credentials',
                  }),
                })
              )
            )
          );
          if (Option.isNone(cookie)) {
            return yield* UnauthorizedError.make();
          }
          return yield* next(HttpClientRequest.setHeader(request, 'cookie', cookie.value)).pipe(
            Effect.provideService(FetchHttpClient.RequestInit, { credentials: 'omit' })
          );
        })
      )
    );
    return yield* HttpApiClient.make(Api, { baseUrl: account.serverUrl }).pipe(
      Effect.provideContext(middleware)
    );
  }),
}) {
  public static readonly layerNoDeps = (account: AccountKey) =>
    Layer.effect(this, this.make(account));

  public static readonly layer = (account: AccountKey) =>
    this.layerNoDeps(account).pipe(Layer.provide([AuthClientMap.layer, FetchHttpClient.layer]));
}

/** Lazily shares a client and its authentication scope per server/user identity. */
export class ApiClientMap extends Context.Service<ApiClientMap>()('voel/api-client/ApiClientMap', {
  make: LayerMap.make((account: AccountKey) => ApiClient.layerNoDeps(account), {
    idleTimeToLive: '5 minutes',
  }).pipe(
    Effect.map((map) => ({
      ...map,
      acquire: (account: AccountKey) =>
        map.contextEffect(account).pipe(Effect.map(Context.get(ApiClient))),
    }))
  ),
}) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AuthClientMap.layer, FetchHttpClient.layer])
  );
}
