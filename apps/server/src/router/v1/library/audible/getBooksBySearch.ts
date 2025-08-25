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

      runtime_length_min: Schema.Number,

      product_images: Schema.Struct({
        '500': Schema.String,
      }),

      series: Schema.optional(
        Schema.Array(
          Schema.Struct({
            asin: Schema.String,
            title: Schema.String,
            sequence: Schema.String,
          })
        )
      ),
    })
  ),
});

export type GetBooksBySearchRequestParams =
  | {
      readonly asins: string[];
      readonly title?: never;
      readonly author?: never;
      readonly publisher?: never;
      readonly narrator?: never;
    }
  | {
      readonly asins?: never;
      readonly title?: string;
      readonly author?: string;
      readonly publisher?: string;
      readonly narrator?: string;
    };

type GetBooksBySearchRequest = Request.Request<
  (typeof BookSearchResponseSchema.Type)['products'],
  RequestError | ResponseError | ParseResult.ParseError
> & { readonly _tag: 'GetBooksBySearchRequest' } & GetBooksBySearchRequestParams;

export const GetBooksBySearchRequest =
  Request.tagged<GetBooksBySearchRequest>('GetBooksBySearchRequest');

export const makeGetBooksBySearchResolver = (client: HttpClient.HttpClient) =>
  RequestResolver.fromEffect((params: GetBooksBySearchRequest) =>
    HttpClientRequest.get(`${env.AUDIBLE_API_BASE}/catalog/products`).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setUrlParams({
        ...(params.asins
          ? { asins: params.asins.join(',') }
          : {
              title: params.title,
              author: params.author,
              publisher: params.publisher,
              narrator: params.narrator,
            }),
        num_results: 50,
        page: 0,
        response_groups: [
          'contributors',
          'media',
          'product_desc',
          'product_details',
          'series',
        ].join(','),
      }),
      client.execute,
      Effect.tapErrorTag('RequestError', (error) =>
        Effect.logError('An error occurred while requesting search results').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError('An error occurred while receiving search results').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.andThen((response) => response.json),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError("Search results couldn't be parsed as JSON").pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.andThen(Schema.decodeUnknown(BookSearchResponseSchema)),
      Effect.tapErrorTag('ParseError', (error) =>
        Effect.logError('Search results were not in the expected shape').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.map((response) => response.products),
      Effect.annotateLogs({
        asins: params.asins?.join(','),
        title: params.title,
        author: params.author,
        publisher: params.publisher,
        narrator: params.narrator,
      })
    )
  );
