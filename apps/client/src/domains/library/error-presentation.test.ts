import { expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { HttpClientError, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';

import { BetterAuthClientInitializationError } from '@repo/auth-api/client.ts';
import { Api } from '@repo/spec-api';

import { accountFailureMessage } from '#src/domains/accounts/error-presentation.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';

const request = HttpClientRequest.get('https://example.com/api/libraries/1');
const decodeLibrary = HttpApiClient.decodeResponse(Api, { group: 'library', endpoint: 'get' });

it.effect(
  'presents semantic API errors decoded from real response bodies',
  Effect.fnUntraced(function* () {
    for (const { status, body, message } of [
      {
        status: 401,
        body: { _tag: 'UnauthorizedError' },
        message: 'Your session has expired. Sign in again.',
      },
      {
        status: 403,
        body: { _tag: 'ForbiddenError' },
        message: 'Only server administrators can manage libraries.',
      },
      {
        status: 404,
        body: { _tag: 'LibraryNotFoundError', id: 1 },
        message: 'This library no longer exists.',
      },
    ]) {
      const error = yield* decodeLibrary(
        HttpClientResponse.fromWeb(request, Response.json(body, { status }))
      ).pipe(Effect.flip);
      expect(libraryFailureMessage({ error })).toBe(message);
    }
  })
);

it.effect(
  'keeps malformed and new-server responses at a safe decoding boundary',
  Effect.fnUntraced(function* () {
    for (const { response, message } of [
      {
        response: Response.json({ private: 'unexpected success payload' }),
        message: 'The server returned an invalid response. Try again.',
      },
      {
        response: Response.json(
          { _tag: 'NewServerError', message: 'private diagnostics' },
          { status: 418 }
        ),
        message: 'The server returned an invalid response. Try again.',
      },
      {
        response: Response.json(
          { _tag: 'NewServerError', message: 'private diagnostics' },
          { status: 404 }
        ),
        message: 'The server could not complete this request. Try again.',
      },
    ]) {
      const error = yield* decodeLibrary(HttpClientResponse.fromWeb(request, response)).pipe(
        Effect.flip
      );
      expect(libraryFailureMessage({ error })).toBe(message);
    }
  })
);

it('reuses client copy for transport, response decoding and authentication initialization', () => {
  const cause = new Error('private diagnostics');
  expect(
    libraryFailureMessage({
      error: new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, cause }),
      }),
    })
  ).toBe('Unable to reach the server. Check your connection and try again.');
  const response = HttpClientResponse.fromWeb(request, new Response('not json'));
  expect(
    libraryFailureMessage({
      error: new HttpClientError.HttpClientError({
        reason: new HttpClientError.DecodeError({ request, response, cause }),
      }),
    })
  ).toBe('The server returned an invalid response. Try again.');
  const invalid = Schema.decodeUnknownExit(Schema.String)(null);
  // Exercise a real SchemaError rather than fabricating decoder internals.
  const error = Effect.runSync(Effect.flip(invalid));
  expect(libraryFailureMessage({ error })).toBe(
    'The server returned an invalid response. Try again.'
  );
  const initialization = BetterAuthClientInitializationError.make({ error: cause });
  expect(libraryFailureMessage({ error: initialization })).toBe(
    accountFailureMessage({ error: initialization })
  );
});
