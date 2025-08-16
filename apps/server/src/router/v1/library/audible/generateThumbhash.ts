import { HttpClient, HttpClientRequest } from '@effect/platform';
import type { RequestError, ResponseError } from '@effect/platform/HttpClientError';
import { Data, Effect, ParseResult, Request, RequestResolver } from 'effect';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';

class SharpError extends Data.TaggedClass('SharpError')<{
  error: Error;
}> {}

class ThumbhashError extends Data.TaggedClass('ThumbhashError')<{
  error: Error;
}> {}

interface GenerateThumbhashRequest
  extends Request.Request<
    string,
    RequestError | ResponseError | ParseResult.ParseError | SharpError | ThumbhashError
  > {
  readonly _tag: 'GenerateThumbhashRequest';
  readonly imageURL: string;
}

export const GenerateThumbhashRequest = Request.tagged<GenerateThumbhashRequest>(
  'GenerateThumbhashRequest'
);

export const GenerateThumbhashResolver = (client: HttpClient.HttpClient) =>
  RequestResolver.fromEffect(({ imageURL }: GenerateThumbhashRequest) =>
    HttpClientRequest.get(imageURL).pipe(
      client.execute,
      Effect.tapErrorTag('RequestError', (error) =>
        Effect.logError('An error occurred while requesting image').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError('An error occurred while receiving image').pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.andThen((response) => response.arrayBuffer),
      Effect.tapErrorTag('ResponseError', (error) =>
        Effect.logError("Image couldn't be parsed as ArrayBuffer").pipe(
          Effect.annotateLogs('error', error.message)
        )
      ),
      Effect.tryMapPromise({
        try: (imageBuffer) =>
          sharp(imageBuffer)
            .resize({
              width: 100,
              height: 100,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true }),
        catch: (error) =>
          new SharpError(
            error instanceof Error ? { error } : { error: new Error('Unknown sharp error') }
          ),
      }),
      Effect.tapErrorTag('SharpError', (error) =>
        Effect.logError(
          "Either: sharp couldn't be initialized, or image couldn't be resized, or alpha channel couldn't be ensured, or image couldn't be converted to raw format, or raw data couldn't be converted to buffer"
        ).pipe(Effect.annotateLogs('error', error.error.message))
      ),
      Effect.tryMap({
        try: ({ data, info }) =>
          Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64'),
        catch: (error) =>
          new ThumbhashError(
            error instanceof Error ? { error } : { error: new Error('Unknown thumbhash error') }
          ),
      }),
      Effect.tapErrorTag('SharpError', (error) =>
        Effect.logError(
          "Either: thumbhash couldn't be generated because the image doesn't fit in 100x100, or thumbhash couldn't be converted to base64"
        ).pipe(Effect.annotateLogs('error', error.error.message))
      ),
      Effect.annotateLogs('imageURL', imageURL)
    )
  );
