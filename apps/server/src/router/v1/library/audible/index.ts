import { FetchHttpClient, HttpClient } from '@effect/platform';
import { Effect, FiberRef, Layer, Request, RequestResolver } from 'effect';

import {
  GenerateThumbhashRequest,
  makeGenerateThumbhashResolver,
} from '@/router/v1/library/audible/generateThumbhash';
import {
  GetAuthorByAsinRequest,
  makeGetAuthorByAsinResolver,
} from '@/router/v1/library/audible/getAuthorByAsin';
import {
  GetBooksBySearchRequest,
  type GetBooksBySearchRequestParams,
  makeGetBooksBySearchResolver,
} from '@/router/v1/library/audible/getBooksBySearch';
import {
  GetChaptersByAsinRequest,
  makeGetChaptersByAsinResolver,
} from '@/router/v1/library/audible/getChaptersByAsin';
import {
  GetProductByAsinRequest,
  makeGetProductByAsinResolver,
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

    const getAuthorbyAsinResolver = makeGetAuthorByAsinResolver(client);
    const getBooksBySearchResolver = makeGetBooksBySearchResolver(client);
    const getChaptersByAsinResolver = makeGetChaptersByAsinResolver(client);
    const getProductByAsinResolver = makeGetProductByAsinResolver(client, turndown);
    const generateThumbhashResolver = makeGenerateThumbhashResolver(client);

    return {
      getAuthorByAsin: (params: Parameters<typeof GetAuthorByAsinRequest>[0]) =>
        requestWithCacheInvalidateOnError(GetAuthorByAsinRequest(params), getAuthorbyAsinResolver),
      getBooksBySearch: (params: GetBooksBySearchRequestParams) =>
        requestWithCacheInvalidateOnError(
          GetBooksBySearchRequest(params),
          getBooksBySearchResolver
        ),
      getChaptersByAsin: (params: Parameters<typeof GetChaptersByAsinRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GetChaptersByAsinRequest(params),
          getChaptersByAsinResolver
        ),
      getProductByAsin: (params: Parameters<typeof GetProductByAsinRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GetProductByAsinRequest(params),
          getProductByAsinResolver
        ),
      generateThumbhash: (params: Parameters<typeof GenerateThumbhashRequest>[0]) =>
        requestWithCacheInvalidateOnError(
          GenerateThumbhashRequest(params),
          generateThumbhashResolver
        ),
    };
  }),

  dependencies: [
    Layer.setRequestCaching(true),
    Layer.setRequestCache(Request.makeCache({ capacity: 65536, timeToLive: '1 hours' })),
    FetchHttpClient.layer,
    Turndown.Default,
  ],
}) {}
