import { Library as PluginLibrary } from '@govoel/plugins/library';
import { StoragePluginSettingsForm, StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { useSelector } from '@tanstack/react-form';
import { Array, Data, Effect, Match, Option, Record, Schema } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { useState } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { StoragePluginId } from '@repo/spec-api/domains/plugins/storage.ts';

import { ApiClientMap } from '#src/api-client.ts';
import { useAppForm } from '#src/components/form';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { LibraryNameInput, RootRow } from '#src/domains/library/management.ts';

export class LibraryDefinition extends Schema.Struct({
  name: LibraryNameInput,
  type: PluginLibrary.fields.type,
  storagePlugin: StoragePluginId,
}) {}

class Configuration extends Schema.Struct({
  definition: LibraryDefinition,
  fields: StoragePluginSettingsForm,
}) {}

const SetupResult = Schema.TaggedUnion({
  Loaded: { configuration: Configuration },
  OpenSettings: {},
  OpenRoots: {},
  Created: { id: Library.fields.id },
});
const Setup = Data.taggedEnum<typeof SetupResult.Type>();

class Input extends Schema.Struct({
  ...LibraryDefinition.fields,
  values: Schema.Record(Schema.String, Schema.String),
  roots: Schema.Array(RootRow),
}) {}

class DraftInput extends Schema.Struct({
  ...Input.fields,
  roots: Schema.Array(Schema.Struct({ key: Schema.String, root: Schema.String })),
}) {}

export const sameDefinition = (request: {
  readonly values: typeof LibraryDefinition.Encoded;
  readonly definition: typeof LibraryDefinition.Type;
}) =>
  request.values.name === request.definition.name &&
  request.values.type === request.definition.type &&
  request.values.storagePlugin === request.definition.storagePlugin;

export const loadDraftSettings = Effect.fnUntraced(function* ({
  account,
  definition,
}: {
  readonly account: AccountKey;
  readonly definition: typeof LibraryDefinition.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  return {
    definition,
    fields: yield* client.library.getDraftStoragePluginSettingsForm({ payload: definition }),
  };
});

export const createLibrary = Effect.fnUntraced(function* ({
  account,
  definition,
  values,
  roots,
}: {
  readonly account: AccountKey;
  readonly definition: typeof LibraryDefinition.Type;
  readonly values: (typeof Input.Type)['values'];
  readonly roots: (typeof Input.Type)['roots'];
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  return yield* client.library
    .create({
      payload: {
        ...definition,
        storagePluginSettings: yield* Schema.decodeEffect(StoragePluginSettingsInput)(values),
        roots: Array.map(roots, ({ root }) => ({ root })),
      },
    })
    .pipe(Reactivity.mutation(['library']));
});

const advanceSetup = Effect.fnUntraced(function* ({
  account,
  value,
  configuration,
  expanded,
}: {
  readonly account: AccountKey;
  readonly value: typeof Input.Type;
  readonly configuration: Option.Option<typeof Configuration.Type>;
  readonly expanded: 'library' | 'settings' | 'roots';
}) {
  const definition = yield* Schema.decodeEffect(LibraryDefinition)({
    name: value.name,
    type: value.type,
    storagePlugin: value.storagePlugin,
  });
  if (
    Option.isNone(configuration) ||
    !sameDefinition({ values: value, definition: configuration.value.definition })
  ) {
    return Setup.Loaded({
      configuration: yield* loadDraftSettings({ account, definition }),
    });
  }
  if (expanded === 'library') {
    return Setup.OpenSettings();
  }
  if (expanded === 'settings') {
    return Setup.OpenRoots();
  }
  const result = yield* createLibrary({
    account,
    definition,
    values: value.values,
    roots: value.roots,
  });
  return Setup.Created({ id: result.id });
});

export const useCreateLibraryForm = ({
  onSuccess,
}: {
  readonly onSuccess: (id: typeof Library.fields.id.Type) => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  const [configuration, setConfiguration] = useState<Option.Option<typeof Configuration.Type>>(
    Option.none()
  );
  const [expanded, setExpanded] = useState<'library' | 'settings' | 'roots'>('library');
  const form = useAppForm({
    schema: expanded === 'roots' ? Input : DraftInput,
    defaultValues: {
      name: '',
      type: 'audiobook',
      storagePlugin: 'builtin:local',
      values: {},
      roots: [],
    },
    onSubmit: ({ value }) => advanceSetup({ account, value, configuration, expanded }),
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tag(
          'LibraryNameConflictError',
          () => 'A library with this name already exists. Edit the name above and try again.'
        ),
        Match.tag('LibraryInvalidRootError', ({ roots }) =>
          Array.join(
            Array.map(roots, ({ root, message }) => `${root}: ${message}`),
            '\n'
          )
        ),
        Match.tag(
          'StoragePluginInvalidSettingsError',
          ({ message }) => `Storage settings: ${message}`
        ),
        Match.tag(
          'PluginLoadError',
          'StoragePluginLoadError',
          () => 'Unable to load this storage plugin. Check its ID and try again.'
        ),
        Match.orElse(
          () =>
            'Unable to configure the library. Check your connection and settings, then try again.'
        )
      ),
    onSuccess: async ({ result, formApi }) => {
      await Match.value(result).pipe(
        Match.tagsExhaustive({
          Loaded: ({ configuration: loaded }) => {
            setConfiguration(Option.some(loaded));
            formApi.setFieldValue(
              'values',
              Record.fromEntries(
                Array.map(loaded.fields, ({ name, initialValue }) => [name, initialValue] as const)
              )
            );
            setExpanded('settings');
          },
          OpenSettings: () => {
            setExpanded('settings');
          },
          OpenRoots: () => {
            setExpanded('roots');
          },
          Created: async ({ id }) => {
            await onSuccess(id);
          },
        })
      );
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const busy = useSelector(form.store, (state) => state.isSubmitting);
  const ready =
    Option.isSome(configuration) &&
    sameDefinition({ values, definition: configuration.value.definition });
  return {
    form,
    expanded,
    busy,
    ready,
    fields: ready && Option.isSome(configuration) ? configuration.value.fields : [],
    primaryLabel:
      !ready || expanded === 'library'
        ? 'Continue'
        : { settings: 'Continue', roots: 'Create library' }[expanded],
    handleExpand: (section: typeof expanded) => {
      if (!busy && (section === 'library' || ready)) {
        setExpanded(section);
      }
    },
  };
};
