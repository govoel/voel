import { Match, flow } from 'effect';
import type { Effect } from 'effect';
import type { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import type { Atom } from 'effect/reactivity';

import type { Api } from '@repo/spec-api';

import type { ApiClient } from '#src/api-client.ts';
import { accountFailureMessage } from '#src/domains/accounts/error-presentation.ts';
import type { listLibrariesAtom } from '#src/domains/library/management.ts';
import { clientFailureMessage } from '#src/errors.ts';

// Every endpoint in the library API contributes, including endpoints the UI
// does not call yet. Extending its contract makes this presenter non-exhaustive.
type LibraryError =
  | HttpApiEndpoint.Errors<HttpApiGroup.Endpoints<typeof Api.groups.library>>
  | Effect.Error<ReturnType<typeof ApiClient.make>>
  | Parameters<typeof clientFailureMessage>[0]['error'];

export const libraryFailureMessage = flow(
  ({ error }: { readonly error: LibraryError }) => error,
  Match.type<LibraryError>().pipe(
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
  )
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
