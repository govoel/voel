import { Context, Effect, Layer, LayerMap, Option } from 'effect';
import { FetchHttpClient, HttpClientError, HttpClientRequest } from 'effect/http';
import { HttpApiClient, HttpApiMiddleware } from 'effect/http-api';

import { Api } from '@repo/spec-api';
import { AuthMiddleware, UnauthorizedError } from '@repo/spec-api/middlewares/auth.ts';

import { AuthClientMap } from '#src/services/auth-client/index.ts';
import type { AuthClientKey } from '#src/services/auth-client/index.ts';

/** An authenticated HTTP client bound to one sign-in, not the mutable active account. */
export class ApiClient extends Context.Service<ApiClient>()('voel/services/api-client/ApiClient', {
  make: Effect.fnUntraced(function* (key: AuthClientKey) {
    const authentication = yield* AuthClientMap.use((authClients) => authClients.acquire(key));

    const middleware = yield* Layer.build(
      HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
        Effect.gen(function* () {
          // Read at dispatch time so rotation and sign-out affect existing clients.
          const cookie = yield* authentication.getCookie.pipe(
            Effect.catchTag('AuthClientGetCookieError', (cause) =>
              Effect.fail(
                new HttpClientError.HttpClientError({
                  reason: new HttpClientError.TransportError({
                    request,
                    description: 'Unable to read API authentication credentials',
                    cause,
                  }),
                })
              )
            )
          );
          if (Option.isNone(cookie)) {
            return yield* UnauthorizedError.make();
          }
          return yield* next(HttpClientRequest.setHeader(request, 'cookie', cookie.value));
        })
      )
    );
    return yield* HttpApiClient.make(Api, { baseUrl: key.serverUrl }).pipe(
      Effect.provideContext(middleware)
    );
  }),
}) {
  public static readonly layerNoDeps = (key: AuthClientKey) => Layer.effect(this, this.make(key));

  public static readonly layer = (key: AuthClientKey) =>
    this.layerNoDeps(key).pipe(Layer.provide([AuthClientMap.layer, FetchHttpClient.layer]));
}

/** Lazily shares one scoped client per server and auth-storage identity. */
export class ApiClientMap extends Context.Service<ApiClientMap>()(
  'voel/services/api-client/ApiClientMap',
  {
    make: LayerMap.make((key: typeof AuthClientMap.Key.Type) => ApiClient.layerNoDeps(key), {
      idleTimeToLive: '5 minutes',
    }).pipe(
      Effect.map((map) => ({
        ...map,
        /** Keep the client alive in the caller's scope; profile metadata is not part of its key. */
        acquire: (key: Parameters<typeof AuthClientMap.Key.make>[0]) =>
          map.contextEffect(AuthClientMap.Key.make(key)).pipe(Effect.map(Context.get(ApiClient))),
      }))
    ),
  }
) {
  public static readonly Key = AuthClientMap.Key;

  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AuthClientMap.layer, FetchHttpClient.layer])
  );
}
