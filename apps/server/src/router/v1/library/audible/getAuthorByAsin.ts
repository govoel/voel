import { HttpClient, HttpClientRequest } from '@effect/platform';
import type { RequestError, ResponseError } from '@effect/platform/HttpClientError';
import { Data, Effect, ParseResult, Request, RequestResolver, Schema, pipe } from 'effect';

import { env } from '@/env';

const AuthorNameAndProfileImageSchema = Schema.transformOrFail(
  Schema.Struct({
    model: Schema.Struct({
      name: Schema.Struct({
        value: Schema.NonEmptyString,
      }),
      profile_image: Schema.Struct({
        lazy_load_url: Schema.NonEmptyString,
        url: Schema.optional(Schema.String),
      }),
    }),
  }),
  Schema.Struct({
    name: Schema.NonEmptyString,
    avatar: Schema.NonEmptyString,
  }),
  {
    strict: true,
    decode: (input) =>
      ParseResult.succeed({
        name: input.model.name.value,
        avatar: input.model.profile_image.url ?? input.model.profile_image.lazy_load_url,
      }),
    encode: (input, _, ast) =>
      ParseResult.fail(
        new ParseResult.Forbidden(ast, input, 'Cannot encode back to response from Audible API.')
      ),
  }
);

const AuthorAboutSchema = Schema.transformOrFail(
  Schema.Struct({
    model: Schema.Struct({
      items: Schema.NonEmptyArray(
        Schema.Struct({
          model: Schema.Struct({
            expandable_content: Schema.Struct({ value: Schema.NonEmptyString }),
          }),
        })
      ),
    }),
  }),
  Schema.NonEmptyString,
  {
    strict: true,
    decode: (input) => ParseResult.succeed(input.model.items[0].model.expandable_content.value),
    encode: (input, _, ast) =>
      ParseResult.fail(
        new ParseResult.Forbidden(ast, input, 'Cannot encode back to response from Audible API.')
      ),
  }
);

class PartialAuthorError extends Data.TaggedError('PartialAuthorError') {}

interface GetAuthorByAsinRequest
  extends Request.Request<
    { asin: string; name: string; avatar: string; about: string | null },
    RequestError | ResponseError | ParseResult.ParseError | PartialAuthorError
  > {
  readonly _tag: 'GetAuthorByAsinRequest';
  readonly asin: string;
}

export const GetAuthorByAsinRequest =
  Request.tagged<GetAuthorByAsinRequest>('GetAuthorByAsinRequest');

export const makeGetAuthorByAsinResolver = (client: HttpClient.HttpClient) =>
  RequestResolver.fromEffect(({ asin }: GetAuthorByAsinRequest) =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.get(
        `${env.AUDIBLE_API_BASE}/screens/audible-android-author-detail/${asin}`
      ).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.setHeaders({
          'x-adp-sw': '0',
          'x-device-type-id': 'A10KISP2GWF0E4',
        }),
        HttpClientRequest.setUrlParams({ author_asin: asin, title_source: 'all' }),
        client.execute,
        Effect.tapErrorTag('RequestError', (error) =>
          Effect.logError('An error occurred while requesting author details').pipe(
            Effect.annotateLogs('error', error.message)
          )
        ),
        Effect.tapErrorTag('ResponseError', (error) =>
          Effect.logError('An error occurred while receiving author details').pipe(
            Effect.annotateLogs('error', error.message)
          )
        ),
        Effect.andThen((response) => response.json),
        Effect.tapErrorTag('ResponseError', (error) =>
          Effect.logError("Author details couldn't be parsed as JSON").pipe(
            Effect.annotateLogs('error', error.message)
          )
        ),
        Effect.andThen(
          Schema.decodeUnknown(
            Schema.Struct({
              sections: Schema.NonEmptyArray(Schema.Object),
            })
          )
        ),
        Effect.tapErrorTag('ParseError', (error) =>
          Effect.logError('Author details were not in the expected shape').pipe(
            Effect.annotateLogs('error', error.message)
          )
        )
      );

      let nameAndImage = null;
      let about = null;

      for (const section of response.sections) {
        if (nameAndImage === null) {
          nameAndImage = yield* pipe(
            section,
            Schema.decodeUnknown(AuthorNameAndProfileImageSchema),
            Effect.catchTag('ParseError', () => Effect.succeed(null))
          );

          if (nameAndImage !== null) continue;
        }

        if (about === null) {
          about = yield* pipe(
            section,
            Schema.decodeUnknown(AuthorAboutSchema),
            Effect.catchTag('ParseError', () => Effect.succeed(null))
          );
        }

        if (nameAndImage !== null && about !== null) break;
      }

      if (nameAndImage === null) {
        return yield* Effect.fail(new PartialAuthorError()).pipe(
          Effect.tapError((error) =>
            Effect.logError("Author's name and avatar were not found").pipe(
              Effect.annotateLogs('error', error.message)
            )
          )
        );
      }

      return yield* Effect.succeed({
        asin,
        name: nameAndImage.name,
        avatar: nameAndImage.avatar,
        about,
      });
    }).pipe(Effect.annotateLogs('asin', asin))
  );
