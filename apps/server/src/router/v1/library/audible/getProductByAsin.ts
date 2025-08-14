import type { Turndown } from './turndown';
import { HttpClient, HttpClientRequest } from '@effect/platform';
import type { RequestError, ResponseError } from '@effect/platform/HttpClientError';
import { Effect, ParseResult, Request, RequestResolver, Schema } from 'effect';

import { env } from '@/env';

export const ProductBookRelationshipSeriesSchema = Schema.Struct({
  asin: Schema.String,
  content_delivery_type: Schema.Literal('BookSeries'),
  relationship_type: Schema.Literal('series'),
  relationship_to_product: Schema.Literal('parent'),
  title: Schema.String,
  sequence: Schema.String,
  sort: Schema.Union(Schema.NumberFromString, Schema.Number),
});

const SinglePartBook = Schema.Struct({
  content_delivery_type: Schema.Literal('SinglePartBook'),
  relationships: Schema.optional(Schema.Array(ProductBookRelationshipSeriesSchema)),
});

const MultiPartBook = Schema.Struct({
  content_delivery_type: Schema.Literal('MultiPartBook'),
  relationships: Schema.optional(
    Schema.Array(
      Schema.Union(
        ProductBookRelationshipSeriesSchema,
        Schema.Struct({
          asin: Schema.String,
          relationship_type: Schema.Literal('component'),
          relationship_to_product: Schema.Literal('child'),
          sort: Schema.Union(Schema.NumberFromString, Schema.Number),
        })
      )
    )
  ),
});

export const ProductBookSchema = Schema.extend(
  Schema.Struct({
    asin: Schema.String,
    format_type: Schema.Union(Schema.Literal('abridged'), Schema.Literal('unabridged')),
    is_adult_product: Schema.Boolean,

    authors: Schema.Array(
      Schema.Struct({
        asin: Schema.optional(Schema.String),
        name: Schema.String,
      })
    ),
    narrators: Schema.Array(
      Schema.Struct({
        name: Schema.String,
      })
    ),
    series: Schema.optional(
      Schema.Array(
        Schema.Struct({
          asin: Schema.String,
          title: Schema.String,
        })
      )
    ),

    title: Schema.NonEmptyString,
    subtitle: Schema.optional(Schema.String),
    copyright: Schema.String,
    publisher_name: Schema.String,
    product_images: Schema.Struct({
      '500': Schema.String,
    }),

    publisher_summary: Schema.NonEmptyString,
  }),
  Schema.Union(SinglePartBook, MultiPartBook)
);

// TODO: Write test to confirm book's summary gets converted to markdown
const makeMarkdownProductBookSchema = (turndown: Turndown) =>
  Schema.transformOrFail(ProductBookSchema, ProductBookSchema, {
    strict: false,
    decode: (input) =>
      turndown.toMarkdown(input.publisher_summary).pipe(
        Effect.tapError(() =>
          Effect.logWarning(
            'Failed to convert book summary to markdown, falling back to omit summary'
          )
        ),
        Effect.catchAll(() => Effect.succeed(undefined)),
        Effect.map((summary) => ({ ...input, publisher_summary: summary }))
      ),
    encode: (input, _, ast) =>
      ParseResult.fail(
        new ParseResult.Forbidden(ast, input, 'Cannot encode back to response from Audible API.')
      ),
  });

export const ProductSeriesSchema = Schema.Struct({
  content_delivery_type: Schema.Literal('BookSeries'),

  asin: Schema.String,

  authors: Schema.Array(
    Schema.Struct({
      // not all series provide an asin here
      asin: Schema.optional(Schema.String),
      name: Schema.NonEmptyString,
    })
  ),
  relationships: Schema.Array(
    Schema.Struct({
      asin: Schema.String,
      relationship_type: Schema.Literal('series'),
      relationship_to_product: Schema.Literal('child'),
      sequence: Schema.String,
      sort: Schema.Union(Schema.NumberFromString, Schema.Number),
    })
  ),

  title: Schema.NonEmptyString,

  // not all series provide a summary
  publisher_summary: Schema.optional(Schema.String),
});

// TODO: Write test to confirm series' summary gets converted to markdown
const makeMarkdownProductSeriesSchema = (turndown: Turndown) =>
  Schema.transformOrFail(ProductSeriesSchema, ProductSeriesSchema, {
    strict: false,
    decode: (input) =>
      Effect.if(typeof input.publisher_summary === 'string', {
        onTrue: () =>
          turndown.toMarkdown(input.publisher_summary!).pipe(
            Effect.tapError(() =>
              Effect.logWarning(
                'Failed to convert series summary to markdown, falling back to omit summary'
              )
            ),
            Effect.catchAll(() => Effect.succeed(undefined)),
            Effect.map((summary) => ({ ...input, publisher_summary: summary }))
          ),
        onFalse: () => Effect.succeed(input),
      }),
    encode: (input, _, ast) =>
      ParseResult.fail(
        new ParseResult.Forbidden(ast, input, 'Cannot encode back to response from Audible API.')
      ),
  });

const makeProductResponseSchema = (turndown: Turndown) =>
  Schema.Struct({
    product: Schema.Union(
      makeMarkdownProductBookSchema(turndown),
      makeMarkdownProductSeriesSchema(turndown)
    ),
  });

interface GetProductByAsinRequest
  extends Request.Request<
    ReturnType<typeof makeProductResponseSchema>['Type']['product'],
    RequestError | ResponseError | ParseResult.ParseError
  > {
  readonly _tag: 'GetProductByAsinRequest';
  readonly asin: string;
}

export const GetProductByAsinRequest =
  Request.tagged<GetProductByAsinRequest>('GetProductByAsinRequest');

export const GetProductByAsinResolver = (client: HttpClient.HttpClient, turndown: Turndown) => {
  const ProductResponseSchema = makeProductResponseSchema(turndown);

  return RequestResolver.fromEffect(({ asin }: GetProductByAsinRequest) =>
    HttpClientRequest.get(`${env.AUDIBLE_API_BASE}/catalog/products/${asin}`).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setUrlParams({
        response_groups: [
          'contributors',
          'media',
          'product_attrs',
          'product_desc',
          'product_details',
          'product_extended_attrs',
          'series',
          'relationships',
          'category_ladders',
        ].join(','),
      }),
      client.execute,
      Effect.tapErrorTag('RequestError', (error) =>
        Effect.logError('An error occurred while requesting product details', error)
      ),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError('An error occurred while receiving product details', error)
      ),
      Effect.andThen((response) => response.json),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError("Product details couldn't be parsed as JSON", error)
      ),
      Effect.andThen(Schema.decodeUnknown(ProductResponseSchema)),
      Effect.tapErrorTag('ParseError', (error) =>
        Effect.logError('Product details were not in the expected shape', error.message)
      ),
      Effect.map((response) => response.product),
      Effect.annotateLogs('asin', asin)
    )
  );
};
