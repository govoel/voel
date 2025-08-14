import { FetchHttpClient, HttpClient } from '@effect/platform';
import { Effect, FiberRef, Layer, Request, RequestResolver } from 'effect';

import {
  GenerateThumbhashRequest,
  GenerateThumbhashResolver,
} from '@/router/v1/library/audible/generateThumbhash';
import {
  GetAuthorByAsinRequest,
  GetAuthorByAsinResolver,
} from '@/router/v1/library/audible/getAuthorByAsin';
import {
  GetBooksBySearchRequest,
  GetBooksBySearchResolver,
} from '@/router/v1/library/audible/getBooksBySearch';
import {
  GetChaptersByAsinRequest,
  GetChaptersByAsinResolver,
} from '@/router/v1/library/audible/getChaptersByAsin';
import {
  GetProductByAsinRequest,
  GetProductByAsinResolver,
} from '@/router/v1/library/audible/getProductByAsin';
import { Turndown } from '@/router/v1/library/audible/turndown';

export {
  ProductBookSchema,
  ProductSeriesSchema,
} from '@/router/v1/library/audible/getProductByAsin';

export { BookSearchResponseSchema } from '@/router/v1/library/audible/getBooksBySearch';

export const requestWithCacheInvalidateOnError = <
  A extends Request.Request<unknown, unknown>,
  Ds extends
    | RequestResolver.RequestResolver<A>
    | Effect.Effect<RequestResolver.RequestResolver<A>, unknown, unknown>,
>(
  req: A,
  resolver: Ds
) =>
  Effect.request(req, resolver).pipe(
    Effect.tapErrorCause(() =>
      FiberRef.get(FiberRef.currentRequestCache).pipe(
        Effect.andThen((cache) => cache.invalidate(req))
      )
    )
  );

export class Audible extends Effect.Service<Audible>()('Audible', {
  effect: Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.tapRequest((request) =>
        Effect.logDebug(`Requesting ${request.method} ${request.url}`)
      ),
      HttpClient.filterStatusOk
    );

    const turndown = yield* Turndown;

    return {
      getAuthorByAsin: (params: Parameters<typeof GetAuthorByAsinRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GetAuthorByAsinRequest(params),
          GetAuthorByAsinResolver(client)
        ),
      getBooksBySearch: (params: Parameters<typeof GetBooksBySearchRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GetBooksBySearchRequest(params),
          GetBooksBySearchResolver(client)
        ),
      getChaptersByAsin: (params: Parameters<typeof GetChaptersByAsinRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GetChaptersByAsinRequest(params),
          GetChaptersByAsinResolver(client)
        ),
      getProductByAsin: (params: Parameters<typeof GetProductByAsinRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GetProductByAsinRequest(params),
          GetProductByAsinResolver(client, turndown)
        ),
      generateThumbhash: (params: Parameters<typeof GenerateThumbhashRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GenerateThumbhashRequest(params),
          GenerateThumbhashResolver(client)
        ),
    };
  }).pipe(Effect.withRequestCaching(true)),

  dependencies: [
    Layer.setRequestCache(Request.makeCache({ capacity: 65536, timeToLive: '1 hours' })),
    FetchHttpClient.layer,
    Turndown.Default,
  ],
}) {}
