import { Match } from 'effect';
import type { Effect, Schema } from 'effect';
import type { HttpClientError } from 'effect/http';
import type { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import type { Atom } from 'effect/reactivity';

import type { LibraryApi } from '@repo/spec-api/domains/library/http.ts';

import type { ApiClient } from '#src/api-client.ts';
import { accountFailureMessage } from '#src/domains/accounts/error-presentation.ts';
import type { listLibrariesAtom } from '#src/domains/library/management.ts';
import { clientFailureMessage } from '#src/errors.ts';

type LibraryFailure =
  | HttpApiEndpoint.Errors<HttpApiGroup.Endpoints<typeof LibraryApi>>
  | Effect.Error<ReturnType<typeof ApiClient.make>>
  | HttpClientError.HttpClientError
  | Schema.SchemaError;

export const libraryFailureMessage = ({ error }: { readonly error: LibraryFailure }) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      UnauthorizedError: () => 'Your session has expired. Sign in again.',
      ForbiddenError: () => 'Only server administrators can manage libraries.',
      LibraryNotFoundError: () => 'This library no longer exists.',
      LibraryNameConflictError: () =>
        'A library with this name already exists. Choose another name.',
      StoragePluginSettingsConstructionError: () => 'Unable to load storage settings. Try again.',
      StoragePluginInvalidSettingsError: () => 'Check the storage settings and try again.',
      StoragePluginSettingsError: () => 'Unable to apply storage settings. Try again.',
      PluginLoadError: () => 'Unable to load the plugin. Check its configuration and try again.',
      StoragePluginLoadError: () =>
        'Unable to load the storage plugin. Check its configuration and try again.',
      SchemaError: (failure) => clientFailureMessage({ error: failure }),
      HttpClientError: (failure) => clientFailureMessage({ error: failure }),
      BetterAuthClientInitializationError: (failure) => accountFailureMessage({ error: failure }),
    })
  );

// Atom.pull exhaustion has meaning only for this operation, not authentication.
export const libraryListFailure = ({
  error,
}: {
  readonly error: Atom.Failure<ReturnType<typeof listLibrariesAtom>>;
}) =>
  Match.value(error).pipe(
    Match.tag('NoSuchElementError', () => ({
      kind: 'empty' as const,
      message: 'No libraries yet. Create a library to get started.',
    })),
    Match.tag(
      'UnauthorizedError',
      'ForbiddenError',
      'SchemaError',
      'HttpClientError',
      'BetterAuthClientInitializationError',
      (failure) => ({ kind: 'error' as const, message: libraryFailureMessage({ error: failure }) })
    ),
    Match.exhaustive
  );
