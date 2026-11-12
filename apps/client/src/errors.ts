import { Match, flow } from 'effect';
import type { Schema } from 'effect';
import type { HttpClientError } from 'effect/http';

export const connectionFailureMessage =
  'Unable to reach the server. Check your connection and try again.';
export const invalidResponseMessage = 'The server returned an invalid response. Try again.';

// Unknown statuses and malformed responses stop at the HTTP/schema boundary.
// Never expose response bodies, diagnostic causes, or decoder details as UI copy.
export const clientFailureMessage = flow(
  ({ error }: { readonly error: HttpClientError.HttpClientError | Schema.SchemaError }) => error,
  Match.type<HttpClientError.HttpClientError | Schema.SchemaError>().pipe(
    Match.tagsExhaustive({
      SchemaError: () => invalidResponseMessage,
      HttpClientError: ({ reason }) =>
        Match.value(reason).pipe(
          Match.tagsExhaustive({
            TransportError: () => connectionFailureMessage,
            EncodeError: () => 'Unable to prepare this request. Check the details and try again.',
            InvalidUrlError: () => 'The server address is invalid. Check it and try again.',
            StatusCodeError: () => 'The server could not complete this request. Try again.',
            DecodeError: () => invalidResponseMessage,
            EmptyBodyError: () => invalidResponseMessage,
          })
        ),
    })
  )
);
