import { HttpClient, HttpClientRequest } from '@effect/platform';
import type { RequestError, ResponseError } from '@effect/platform/HttpClientError';
import { Effect, ParseResult, Request, RequestResolver, Schema } from 'effect';

import type { Turndown } from '@/router/v1/library/audible/turndown';

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

const ProductBookRelationshipPartOfBundleSchema = Schema.Struct({
  asin: Schema.String,
  content_delivery_type: Schema.Literal('Bundle'),
  relationship_type: Schema.Literal('component'),
  relationship_to_product: Schema.Literal('parent'),
  title: Schema.String,
  sort: Schema.Union(Schema.NumberFromString, Schema.Number),
});

const SinglePartBook = Schema.Struct({
  content_delivery_type: Schema.Literal('SinglePartBook'),
  relationships: Schema.optional(
    Schema.Array(
      Schema.Union(ProductBookRelationshipSeriesSchema, ProductBookRelationshipPartOfBundleSchema)
    )
  ),
});

const MultiPartBook = Schema.Struct({
  content_delivery_type: Schema.Literal('MultiPartBook'),
  relationships: Schema.optional(
    Schema.Array(
      Schema.Union(
        ProductBookRelationshipSeriesSchema,
        ProductBookRelationshipPartOfBundleSchema,
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

const ContributorsSchemaIn = Schema.Struct({
  authors: Schema.Array(
    Schema.Struct({
      asin: Schema.optional(Schema.String),
      name: Schema.String,
    })
  ),

  narrators: Schema.optional(
    Schema.Array(
      Schema.Struct({
        asin: Schema.optional(Schema.String),
        name: Schema.String,
      })
    )
  ),
});

const ContributorsSchemaOut = Schema.Struct({
  // TODO: manually matched books will have "corrections", which will be
  // merged with the api response before/after being parsed (after because
  // some corrections may not be able to be correctly merged in *before* parsing,
  // unless all transformations have encode functions)
  contributors: Schema.Array(
    Schema.Struct({
      asin: Schema.optional(Schema.String),
      name: Schema.String,
      role: Schema.Union(
        Schema.Literal('author'),
        Schema.Literal('narrator'),
        Schema.Literal('translator'),
        Schema.Literal('editor'),
        Schema.Literal('foreword')
      ),
    })
  ),
});

const translatorRegex = /\s*-\s*(?:translated by|translator)$/i;
const editorRegex = /\s*-\s*(?:edited by|editor|edited)$/i;
const forewordRegex = /\s*-\s*foreword by$/i;

const ContributorsSchema = Schema.transformOrFail(ContributorsSchemaIn, ContributorsSchemaOut, {
  strict: true,
  decode: (input, _, ast) => {
    const translators: { asin: string | undefined; name: string; role: 'translator' }[] = [];
    const editors: { asin: string | undefined; name: string; role: 'editor' }[] = [];
    const forewords: { asin: string | undefined; name: string; role: 'foreword' }[] = [];
    const authors: { asin: string | undefined; name: string; role: 'author' }[] = [];

    for (const author of input.authors) {
      if (translatorRegex.test(author.name)) {
        translators.push({
          asin: author.asin,
          name: author.name.replace(translatorRegex, ''),
          role: 'translator',
        });
      } else if (editorRegex.test(author.name)) {
        editors.push({
          asin: author.asin,
          name: author.name.replace(editorRegex, ''),
          role: 'editor',
        });
      } else if (forewordRegex.test(author.name)) {
        forewords.push({
          asin: author.asin,
          name: author.name.replace(forewordRegex, ''),
          role: 'foreword',
        });
      } else {
        authors.push({ asin: author.asin, name: author.name, role: 'author' });
      }
    }

    const contributors = [
      authors,
      editors,
      translators,
      forewords,
      (input.narrators ?? []).map((narrator) => ({
        asin: narrator.asin,
        name: narrator.name,
        role: 'narrator' as const,
      })),
    ].flat();

    if (contributors.length === 0) {
      return ParseResult.fail(new ParseResult.Type(ast, input, 'No contributors found'));
    }

    return ParseResult.succeed({
      contributors,
    });
  },
  encode: (input, _, ast) =>
    ParseResult.fail(
      new ParseResult.Forbidden(ast, input, 'Cannot encode back to response from Audible API.')
    ),
});

const ProductBookSchemaNoTransforms = Schema.extend(
  Schema.Struct({
    asin: Schema.String,
    format_type: Schema.Union(Schema.Literal('abridged'), Schema.Literal('unabridged')),
    is_adult_product: Schema.Boolean,

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
    product_images: Schema.optional(
      Schema.Struct({
        '500': Schema.String,
      })
    ),

    publisher_summary_md: Schema.optional(Schema.String),
  }),
  Schema.Union(SinglePartBook, MultiPartBook)
);

export const ProductBookSchema = Schema.extend(
  ProductBookSchemaNoTransforms,
  ContributorsSchemaOut
);

// TODO: Write test to confirm book's summary gets converted to markdown
const makeMarkdownProductBookSchema = (turndown: Turndown) =>
  // you can't do `Schema.transformOrFail(ProductBookSchema, ProductBookSchema ...`
  // because that would result in the `AuthorsSchema` transformation running twice,
  // causing translators and editors to always be an empty array
  Schema.transformOrFail(
    ProductBookSchemaNoTransforms.pipe(
      Schema.omit('publisher_summary_md'),
      Schema.extend(Schema.Struct({ publisher_summary: Schema.String })),
      Schema.extend(ContributorsSchema)
    ),
    ProductBookSchema,
    {
      strict: true,
      decode: (input) =>
        turndown.toMarkdown(input.publisher_summary).pipe(
          Effect.tapError((error) =>
            Effect.logWarning(
              'Failed to convert book summary to markdown, falling back to omit summary'
            ).pipe(Effect.annotateLogs('error', error.message))
          ),
          Effect.catchAll(() => Effect.succeed(undefined)),
          Effect.map(
            (summary) =>
              ({ ...input, publisher_summary_md: summary }) as typeof ProductBookSchema.Type
          )
        ),
      encode: (input, _, ast) =>
        ParseResult.fail(
          new ParseResult.Forbidden(ast, input, 'Cannot encode back to response from Audible API.')
        ),
    }
  );

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
  publisher_summary_md: Schema.optional(Schema.String),
});

// TODO: Write test to confirm series' summary gets converted to markdown
const makeMarkdownProductSeriesSchema = (turndown: Turndown) =>
  Schema.transformOrFail(
    ProductSeriesSchema.pipe(
      Schema.omit('publisher_summary_md'),
      Schema.extend(Schema.Struct({ publisher_summary: Schema.optional(Schema.String) }))
    ),
    ProductSeriesSchema,
    {
      strict: true,
      decode: (input) =>
        Effect.if(typeof input.publisher_summary === 'string', {
          onTrue: () =>
            turndown.toMarkdown(input.publisher_summary!).pipe(
              Effect.tapError((error) =>
                Effect.logWarning(
                  'Failed to convert series summary to markdown, falling back to omit summary'
                ).pipe(Effect.annotateLogs('error', error.message))
              ),
              Effect.catchAll(() => Effect.succeed(undefined)),
              Effect.map((summary) => ({ ...input, publisher_summary_md: summary }))
            ),
          onFalse: () => Effect.succeed(input),
        }),
      encode: (input, _, ast) =>
        ParseResult.fail(
          new ParseResult.Forbidden(ast, input, 'Cannot encode back to response from Audible API.')
        ),
    }
  );

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

export const makeGetProductByAsinResolver = (client: HttpClient.HttpClient, turndown: Turndown) => {
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
        Effect.logError('An error occurred while requesting product details').pipe(
          Effect.annotateLogs('error', error)
        )
      ),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError('An error occurred while receiving product details').pipe(
          Effect.annotateLogs('error', error)
        )
      ),
      Effect.andThen((response) => response.json),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError("Product details couldn't be parsed as JSON").pipe(
          Effect.annotateLogs('error', error)
        )
      ),
      Effect.andThen(Schema.decodeUnknown(ProductResponseSchema)),
      Effect.tapErrorTag('ParseError', (error) =>
        Effect.logError('Product details were not in the expected shape').pipe(
          Effect.annotateLogs('error', error)
        )
      ),
      Effect.map((response) => response.product),
      Effect.annotateLogs('asin', asin)
    )
  );
};
