import { HttpClient, HttpClientRequest } from '@effect/platform';
import type { RequestError, ResponseError } from '@effect/platform/HttpClientError';
import { Effect, ParseResult, Request, RequestResolver, Schema } from 'effect';

import { env } from '@/env';

export const BookSearchResponseSchema = Schema.Struct({
  products: Schema.Array(
    Schema.Struct({
      asin: Schema.String,

      authors: Schema.Array(Schema.Struct({ name: Schema.String })),
      narrators: Schema.Array(Schema.Struct({ name: Schema.String })),

      title: Schema.NonEmptyString,
      subtitle: Schema.optional(Schema.String),
      copyright: Schema.String,
      publisher_name: Schema.String,
    })
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
