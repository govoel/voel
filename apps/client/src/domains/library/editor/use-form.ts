import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { useFormGroup, useSelector } from '@tanstack/react-form';
import { Data, Effect, Equal, Option, Schema } from 'effect';
import type { Atom } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm, useGroupSubmit } from '#src/components/form';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import type { libraryEditorAtom } from '#src/domains/library/editor/requests.ts';
import { loadStorageSettingsForms, saveLibrary } from '#src/domains/library/editor/requests.ts';
import {
  LibraryEditorSource,
  LibraryEditorValues,
  forMediaType,
  requiresPluginConsent,
  storageDraft,
} from '#src/domains/library/editor/schema.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';

type StorageState = Data.TaggedEnum<{
  /** The entered plugin isn't the loaded one yet. */
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- No payload.
  NotLoaded: Record<never, never>;
  /** The loaded plugin has no settings form for the media type. */
  Unsupported: { readonly type: typeof Library.jsonCreate.fields.type.Encoded };
  Ready: {
    readonly type: typeof Library.jsonCreate.fields.type.Encoded;
    readonly fields: typeof StoragePluginSettingsForm.Type;
  };
}>;

export const StorageState = Data.taggedEnum<StorageState>();

const decodePluginId = Schema.decodeUnknownOption(Library.jsonCreate.fields.storagePluginId);

export const useLibraryForm = ({
  editor: { source, storage: initialStorage },
  onSuccess,
}: {
  readonly editor: Atom.Success<ReturnType<typeof libraryEditorAtom>>;
  readonly onSuccess: (result: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  const form = useAppForm({
    schema: LibraryEditorValues,
    defaultValues: {
      ...LibraryEditorSource.$match(source, {
        Create: () => ({ name: '', type: 'audiobook' }) as const,
        Edit: ({ library }) => ({ name: library.name, type: library.type }),
      }),
      storagePluginId: initialStorage.storagePluginId,
      storage: storageDraft(initialStorage),
    },
    onSubmit: ({ value }) => saveLibrary({ account, source, values: value }),
    onFailure: ({ error }) => libraryFailureMessage({ error }),
    onSuccess: async ({ result }) => onSuccess(result),
  });
  const loading = useGroupSubmit({
    onSubmit: ({ value }: { readonly value: string }) =>
      Effect.flatMap(
        Schema.decodeEffect(Library.jsonCreate.fields.storagePluginId)(value),
        (storagePluginId) =>
          storagePluginId === form.state.values.storage.storagePluginId
            ? Effect.succeedNone
            : Effect.asSome(loadStorageSettingsForms({ account, source, storagePluginId }))
      ),
    onSuccess: ({ result }) => {
      // A slower load can finish after the plugin ID changed again; only the current one applies.
      const loaded = Option.filter(
        result,
        ({ storagePluginId }) => storagePluginId === form.state.values.storagePluginId
      );
      if (Option.isSome(loaded)) {
        form.setFieldValue('storage', storageDraft(loaded.value), { dontUpdateMeta: true });
      }
    },
    onFailure: ({ error }) => libraryFailureMessage({ error }),
  });
  /**
   * Loading the entered plugin replaces `storage` in one step, once the plugin ID is valid. The
   * group validates before submitting, so the ID is captured when loading starts: the plugin that
   * loads is the one the user saw, and consented to.
   */
  const plugin = useFormGroup({
    form,
    name: 'storagePluginId',
    onSubmitMeta: { storagePluginId: '' },
    onGroupSubmit: async ({ meta }) => loading.onGroupSubmit({ value: meta.storagePluginId }),
    listeners: { onChange: loading.clearError },
  });
  const load = () => {
    void plugin.handleSubmit({ storagePluginId: form.getFieldValue('storagePluginId') });
  };
  const [entered, loaded, submitting] = useSelector(
    form.store,
    (state) =>
      [
        state.values.storagePluginId,
        state.values.storage.storagePluginId,
        state.isSubmitting,
      ] as const
  );
  const storage = useSelector(
    form.store,
    ({ values }) =>
      values.storagePluginId === values.storage.storagePluginId
        ? Option.match(forMediaType(values.storage.forms, values.type), {
            onNone: () => StorageState.Unsupported({ type: values.type }),
            onSome: (fields) => StorageState.Ready({ type: values.type, fields }),
          })
        : StorageState.NotLoaded(),
    { compare: Equal.equals }
  );
  return {
    form,
    submitting,
    provider: entered === 'builtin:local' ? ('local' as const) : ('custom' as const),
    storage,
    plugin: {
      loading: plugin.state.meta.isSubmitting,
      error: loading.error,
      /** The entered plugin, when loading it needs the user's consent first. */
      consent: Option.filter(
        decodePluginId(entered),
        (storagePluginId) =>
          storagePluginId !== loaded && requiresPluginConsent({ source, storagePluginId })
      ),
      load,
    },
    selectProvider: ({ provider }: { readonly provider: 'local' | 'custom' }) => {
      if (provider === 'local') {
        form.setFieldValue('storagePluginId', 'builtin:local');
        load();
      } else {
        form.setFieldValue('storagePluginId', '');
      }
    },
  };
};
