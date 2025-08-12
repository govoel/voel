import { HttpClient, HttpClientRequest } from '@effect/platform';
import type { RequestError, ResponseError } from '@effect/platform/HttpClientError';
import { Effect, ParseResult, Request, RequestResolver, Schema } from 'effect';

import { ProductBookSchema } from '@/router/v1/library/audible/getProductByAsin';

import { env } from '@/env';

export const BookSearchResponseSchema = Schema.Struct({
  products: Schema.Array(
    ProductBookSchema.pipe(
      Schema.pick(
        'asin',
        'authors',
        'narrators',
        'title',
        'subtitle',
        'copyright',
        'publisher_name'
      )
    )
  ),
});

interface GetBooksBySearchRequest
  extends Request.Request<
    (typeof BookSearchResponseSchema.Type)['products'],
    RequestError | ResponseError | ParseResult.ParseError
  > {
  readonly _tag: 'GetBooksBySearchRequest';
  readonly title: string;
  readonly author?: string;
  readonly publisher?: string;
}

export const GetBooksBySearchRequest =
  Request.tagged<GetBooksBySearchRequest>('GetBooksBySearchRequest');

export const GetBooksBySearchResolver = (client: HttpClient.HttpClient) =>
  RequestResolver.fromEffect((params: GetBooksBySearchRequest) =>
    HttpClientRequest.get(`${env.AUDIBLE_API_BASE}/catalog/products`).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setUrlParams({
        ...params,
        num_results: 50,
        page: 0,
        response_groups: ['contributors', 'product_desc', 'product_details'].join(','),
      }),
      client.execute,
      Effect.tapErrorTag('RequestError', (error) =>
        Effect.logError('An error occurred while requesting search results', error)
      ),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError('An error occurred while receiving search results', error)
      ),
      Effect.andThen((response) => response.json),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError("Search results couldn't be parsed as JSON", error)
      ),
      Effect.andThen(Schema.decodeUnknown(BookSearchResponseSchema)),
      Effect.tapErrorTag('ParseError', (error) =>
        Effect.logError('Search results were not in the expected shape', error.message)
      ),
      Effect.map((response) => response.products)
    )
  );
