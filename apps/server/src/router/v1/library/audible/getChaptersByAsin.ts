import { HttpClient, HttpClientRequest } from '@effect/platform';
import type { RequestError, ResponseError } from '@effect/platform/HttpClientError';
import { Effect, ParseResult, Request, RequestResolver, Schema } from 'effect';

import { env } from '@/env';

const LeafChapterSchema = Schema.Struct({
  length_ms: Schema.Number,
  start_offset_ms: Schema.Number,
  start_offset_sec: Schema.Number,
  title: Schema.NonEmptyString,
});

interface ParentChapterSchema {
  readonly length_ms: number;
  readonly start_offset_ms: number;
  readonly start_offset_sec: number;
  readonly title: string;
  readonly chapters: ReadonlyArray<typeof LeafChapterSchema.Type | ParentChapterSchema>;
}

export const ParentChapterSchema = Schema.Struct({
  length_ms: Schema.Number,
  start_offset_ms: Schema.Number,
  start_offset_sec: Schema.Number,
  title: Schema.NonEmptyString,
  chapters: Schema.Array(
    Schema.Union(
      LeafChapterSchema,
      Schema.suspend((): Schema.Schema<ParentChapterSchema> => ParentChapterSchema)
    )
  ),
});

const ChapterResponseSchema = Schema.Struct({
  content_metadata: Schema.Struct({
    chapter_info: Schema.Struct({
      brandIntroDurationMs: Schema.Number,
      brandOutroDurationMs: Schema.Number,
      chapters: Schema.Array(Schema.Union(ParentChapterSchema, LeafChapterSchema)),
      is_accurate: Schema.Boolean,
      runtime_length_ms: Schema.Number,
      runtime_length_sec: Schema.Number,
    }),
  }),
});

interface GetChaptersByAsinRequest
  extends Request.Request<
    (typeof ChapterResponseSchema.Type)['content_metadata']['chapter_info'],
    RequestError | ResponseError | ParseResult.ParseError
  > {
  readonly _tag: 'GetChaptersByAsinRequest';
  readonly asin: string;
}

export const GetChaptersByAsinRequest = Request.tagged<GetChaptersByAsinRequest>(
  'GetChaptersByAsinRequest'
);

export const makeGetChaptersByAsinResolver = (client: HttpClient.HttpClient) =>
  RequestResolver.fromEffect(({ asin }: GetChaptersByAsinRequest) =>
    HttpClientRequest.get(`${env.AUDIBLE_API_BASE}/content/${asin}/metadata`).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setUrlParams({
        response_groups: 'chapter_info',
        chapter_titles_type: 'Tree',
      }),
      client.execute,
      Effect.tapErrorTag('RequestError', (error) =>
        Effect.logError('An error occurred while requesting book chapters').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError('An error occurred while receiving book chapters').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.andThen((response) => response.json),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError("Book chapters couldn't be parsed as JSON").pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.andThen(Schema.decodeUnknown(ChapterResponseSchema)),
      Effect.tapErrorTag('ParseError', (error) =>
        Effect.logError('Book chapters were not in the expected shape').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.map((response) => response.content_metadata.chapter_info),
      Effect.annotateLogs('asin', asin)
    )
  );
