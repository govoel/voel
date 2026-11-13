import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { useFormGroup, useSelector } from '@tanstack/react-form';
import {
  Array,
  Effect,
  String as EffectString,
  Equal,
  Match,
  Option,
  Schema,
  Struct,
} from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';
import { useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm } from '#src/components/form';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  LibraryEditorInput,
  LibraryEditorMetadata,
  LibraryEditorSource,
  libraryStorageSettingsAtom,
  requiresPluginConsent,
  saveLibrary,
  settingsDefaults,
  storageSettingsSchema,
} from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';

class StorageSettingsNotLoaded extends Schema.TaggedError<
  StorageSettingsNotLoaded,
  { readonly brand: unique symbol }
>('voel/components/library-editor/use-form/StorageSettingsNotLoaded')(
  'StorageSettingsNotLoaded',
  {}
) {}

const noSettings = Atom.make(
  AsyncResult.initial<Atom.Success<ReturnType<typeof libraryStorageSettingsAtom>>>()
);

export const useLibraryForm = ({
  source,
  onSuccess,
}: {
  readonly source: LibraryEditorSource;
  readonly onSuccess: (result: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  const [approved, setApproved] = useState<
    Option.Option<typeof LibraryEditorMetadata.Type.storagePluginId>
  >(Option.none());
  const [pending, setPending] = useState<Option.Option<typeof LibraryEditorMetadata.Type>>(
    Option.none()
  );
  const form = useAppForm({
    schema: LibraryEditorInput,
    defaultValues: LibraryEditorSource.$match(source, {
      Create: () =>
        ({
          name: '',
          type: 'audiobook',
          storagePluginId: 'builtin:local',
          storagePluginSettings: {},
        }) satisfies typeof LibraryEditorInput.Encoded,
      Edit: ({ library }) => ({
        name: library.name,
        type: library.type,
        storagePluginId: library.storagePluginId,
        storagePluginSettings: {},
      }),
    }),
    listeners: {
      onChange: ({ fieldApi }) => {
        if (
          Array.some(Struct.keys(LibraryEditorMetadata.fields), (name) => fieldApi.name === name)
        ) {
          setPending(Option.none());
          resetStorage();
        }
      },
    },
    onSubmit: ({ value }) =>
      Effect.andThen(
        AsyncResult.isSuccess(settings) &&
          current(value) &&
          Schema.is(storageSettingsSchema(settings.value))(value.storagePluginSettings)
          ? Effect.void
          : Effect.fail(StorageSettingsNotLoaded.make({})),
        () => saveLibrary({ account, source, values: value })
      ),
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tag('StorageSettingsNotLoaded', () => 'Configure storage settings before saving.'),
        Match.orElse((failure) => libraryFailureMessage({ error: failure }))
      ),
    onSuccess: async ({ result }) => onSuccess(result),
  });
  const metadata = useSelector(
    form.store,
    (state) => Struct.pick(state.values, Struct.keys(LibraryEditorMetadata.fields)),
    { compare: Equal.equals }
  );
  const [canSubmit, submitting] = useSelector(
    form.store,
    (state) => [state.canSubmit, state.isSubmitting] as const
  );
  const input: Option.Option<typeof LibraryEditorMetadata.Type> =
    LibraryEditorMetadata.decodeUnknownOption(metadata);
  const request = Option.filter(
    input,
    ({ storagePluginId }) => !requiresPluginConsent({ source, storagePluginId, approved })
  );
  const query = Option.match(request, {
    onNone: () => noSettings,
    onSome: (requestMetadata) =>
      libraryStorageSettingsAtom({
        account,
        id: LibraryEditorSource.$match(source, {
          Create: () => Option.none(),
          Edit: ({ library }) => Option.some(library.id),
        }),
        request: requestMetadata,
      }),
  });
  const settings = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const current = (value: typeof LibraryEditorMetadata.Encoded) =>
    AsyncResult.isSuccess(settings) &&
    !settings.waiting &&
    Option.isSome(request) &&
    Equal.equals(request, LibraryEditorMetadata.decodeUnknownOption(value));
  const storage = Option.map(
    Option.filter(AsyncResult.value(settings), () => current(metadata)),
    (descriptors) => ({
      descriptors,
      defaultValue: settingsDefaults({ fields: descriptors }),
      validators: {
        onChangeAsync: Schema.toStandardSchemaV1(storageSettingsSchema(descriptors)),
      },
    })
  );
  useFormGroup({
    form,
    name: 'storagePluginSettings',
    ...Option.match(storage, {
      onNone: () => ({ defaultValue: {} }),
      onSome: ({ defaultValue, validators }) => ({ defaultValue, validators }),
    }),
  });
  const resetStorage = ({
    defaultValue = {},
  }: {
    readonly defaultValue?: (typeof LibraryEditorInput.Encoded)['storagePluginSettings'];
  } = {}) => {
    for (const name of Struct.keys(form.state.fieldMeta)) {
      if (
        name === 'storagePluginSettings' ||
        EffectString.startsWith('storagePluginSettings.')(name)
      ) {
        form.resetField(name);
      }
    }
    form.setFieldValue('storagePluginSettings', defaultValue, {
      dontUpdateMeta: true,
      dontValidate: true,
      dontRunListeners: true,
    });
  };
  return {
    form,
    metadata,
    settings,
    storage,
    pending,
    submitting,
    ready: Option.isSome(storage) && canSubmit,
    canOpenStorage: Option.isSome(input) && !submitting,
    needsConsent: Option.isSome(input) && Option.isNone(request),
    handleRetry: refresh,
    resetStorage: () => {
      resetStorage({
        defaultValue: Option.match(storage, {
          onNone: () => ({}),
          onSome: ({ defaultValue }) => defaultValue,
        }),
      });
    },
    handleRequestConsent: () => {
      if (Option.isSome(input) && !submitting) {
        setPending(input);
      }
    },
    handleApprove: () => {
      if (Option.isSome(pending)) {
        setApproved(Option.some(pending.value.storagePluginId));
        setPending(Option.none());
      }
    },
    handleCancelConsent: () => {
      setPending(Option.none());
    },
    selectProvider: ({ provider }: { readonly provider: 'local' | 'custom' }) => {
      form.setFieldValue('storagePluginId', provider === 'local' ? 'builtin:local' : '');
    },
  };
};
