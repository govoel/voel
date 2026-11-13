import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { useSelector } from '@tanstack/react-form';
import { Array, Effect, Option, Order, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm } from '#src/components/form';
import { useFieldContext } from '#src/components/form/hooks.tsx';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  LibraryEditorMetadata,
  libraryFormSchema,
  libraryStorageSettingsAtom,
  requiresPluginConsent,
  sameSettingsRequest,
  saveLibrary,
  settingsDefaults,
} from '#src/domains/library/editor.ts';
import type { LibraryEditorSource } from '#src/domains/library/editor.ts';
import { libraryFailureMessage } from '#src/domains/library/error-presentation.ts';

const decodeMetadata = Schema.decodeUnknownOption(LibraryEditorMetadata);
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
  const [requested, setRequested] = useState(() =>
    source._tag === 'Edit'
      ? decodeMetadata(source.library)
      : Option.none<typeof LibraryEditorMetadata.Type>()
  );
  const [pending, setPending] = useState<Option.Option<typeof LibraryEditorMetadata.Type>>(
    Option.none()
  );
  const approved = useRef<Option.Option<typeof LibraryEditorMetadata.Type.storagePluginId>>(
    source._tag === 'Edit' ? Option.some(source.library.storagePluginId) : Option.none()
  );
  const query = Option.match(requested, {
    onNone: () => noSettings,
    onSome: (request) =>
      libraryStorageSettingsAtom({
        account,
        id: source._tag === 'Edit' ? Option.some(source.library.id) : Option.none(),
        request,
      }),
  });
  const settings = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  const schema = libraryFormSchema(Option.getOrElse(AsyncResult.value(settings), () => []));
  const currentFields = (value: typeof schema.Encoded) =>
    Option.filter(
      AsyncResult.value(settings),
      () =>
        AsyncResult.isSuccess(settings) &&
        !settings.waiting &&
        Option.isNone(pending) &&
        Schema.is(schema.fields.storagePluginSettings)(value.storagePluginSettings) &&
        Option.exists(requested, (request) =>
          sameSettingsRequest({ first: request, second: value })
        )
    );
  const form = useAppForm({
    schema,
    defaultValues: {
      name: source._tag === 'Edit' ? source.library.name : '',
      type: source._tag === 'Edit' ? source.library.type : 'audiobook',
      storagePluginId: source._tag === 'Edit' ? source.library.storagePluginId : 'builtin:local',
      storagePluginSettings: {},
    },
    listeners: {
      onChange: ({ fieldApi }) => {
        if (
          fieldApi.name === 'name' ||
          fieldApi.name === 'type' ||
          fieldApi.name === 'storagePluginId'
        ) {
          setRequested(Option.none());
          setPending(Option.none());
        }
      },
    },
    onSubmit: ({ value }) =>
      Option.filter(
        currentFields(value),
        () =>
          !requiresPluginConsent({
            source,
            storagePluginId: value.storagePluginId,
            approved: approved.current,
          })
      ).pipe(
        Effect.fromOption,
        Effect.flatMap(() => saveLibrary({ account, source, values: value }))
      ),
    onFailure: ({ error }) =>
      error._tag === 'NoSuchElementError'
        ? 'Load storage settings before saving.'
        : libraryFailureMessage({ error }),
    onSuccess: async ({ result }) => onSuccess(result),
  });
  const values = useSelector(form.store, (state) => state.values);
  const fields = currentFields(values);
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const request = decodeMetadata(values);
  const applySettings = useEffectEvent(
    (descriptors: Atom.Success<ReturnType<typeof libraryStorageSettingsAtom>>) => {
      if (Option.isNone(requested)) {
        return;
      }
      const defaults = settingsDefaults({
        fields: descriptors,
        previous: form.state.values.storagePluginSettings,
      });
      form.setFieldValue('storagePluginSettings', defaults, { dontUpdateMeta: true });
    }
  );
  useEffect(() => {
    if (AsyncResult.isSuccess(settings) && !settings.waiting) {
      applySettings(settings.value);
    }
  }, [settings]);

  const load = (input: typeof LibraryEditorMetadata.Type) => {
    if (!Option.contains(approved.current, input.storagePluginId)) {
      form.deleteField('storagePluginSettings');
      form.setFieldValue('storagePluginSettings', {}, { dontUpdateMeta: true });
    }
    approved.current = Option.some(input.storagePluginId);
    if (
      Option.exists(requested, (previous) =>
        sameSettingsRequest({ first: previous, second: input })
      )
    ) {
      refresh();
    } else {
      setRequested(Option.some(input));
    }
  };
  return {
    form,
    values,
    settings,
    fields,
    pending,
    submitting,
    ready: Option.isSome(fields),
    canEditStorage: Schema.is(LibraryEditorMetadata.fields.name)(values.name) && !submitting,
    canLoad: Option.isSome(request) && !settings.waiting && !submitting,
    handleLoad: () => {
      const input = decodeMetadata(form.state.values);
      if (Option.isNone(input) || submitting) {
        return;
      }
      if (
        requiresPluginConsent({
          source,
          storagePluginId: input.value.storagePluginId,
          approved: approved.current,
        })
      ) {
        setPending(input);
      } else {
        load(input.value);
      }
    },
    handleApprove: () => {
      if (Option.isSome(pending)) {
        load(pending.value);
        setPending(Option.none());
      }
    },
    handleCancelConsent: () => {
      setPending(Option.none());
      if (Option.isSome(approved.current)) {
        form.setFieldValue('storagePluginId', approved.current.value);
        const input = decodeMetadata(form.state.values);
        if (Option.isSome(input)) {
          load(input.value);
        }
      }
    },
    selectProvider: ({ provider }: { readonly provider: 'local' | 'custom' }) => {
      form.setFieldValue('storagePluginId', provider === 'local' ? 'builtin:local' : '');
      const input = decodeMetadata(form.state.values);
      if (provider === 'local' && Option.isSome(input)) {
        load(input.value);
      }
    },
  };
};

export type LibraryForm = ReturnType<typeof useLibraryForm>;

export const useStorageListField = () => {
  const field = useFieldContext<Array<string>>();
  const [keys, setKeys] = useState(() => Array.map(field.state.value, (_, index) => index));
  const nextKey = useRef(field.state.value.length);
  return {
    keys,
    handleAdd: () => {
      const key = nextKey.current;
      nextKey.current += 1;
      setKeys((previous) => Array.append(previous, key));
      field.pushValue('');
    },
    handleRemove: ({ indices }: { readonly indices: ReadonlyArray<number> }) => {
      setKeys((previous) => Array.filter(previous, (_, index) => !Array.contains(indices, index)));
      for (const index of Array.sort(indices, Order.flip(Order.Number))) {
        field.removeValue(index);
      }
    },
  };
};
