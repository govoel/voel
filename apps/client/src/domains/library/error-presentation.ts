import { Match } from 'effect';
import type { Effect } from 'effect';
import type { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';

import type { Api } from '@repo/spec-api';

import type { ApiClient } from '#src/api-client.ts';
import { accountFailureMessage } from '#src/domains/accounts/error-presentation.ts';
import { clientFailureMessage } from '#src/errors.ts';

// Every endpoint in the library API contributes, including endpoints the UI
// does not call yet. Extending its contract makes this presenter non-exhaustive.
type LibraryError =
  | HttpApiEndpoint.Errors<HttpApiGroup.Endpoints<typeof Api.groups.library>>
  | Effect.Error<ReturnType<typeof ApiClient.make>>
  | Parameters<typeof clientFailureMessage>[0]['error'];

export const libraryFailureMessage = ({ error }: { readonly error: LibraryError }) =>
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
