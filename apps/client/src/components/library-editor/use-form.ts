import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { useSelector } from '@tanstack/react-form';
import { Effect, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { useAppForm } from '#src/components/form';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import {
  LibraryEditorMetadata,
  LibraryEditorValues,
  libraryStorageSettingsAtom,
  requiresPluginConsent,
  sameSettingsRequest,
  saveLibrary,
  settingsValues,
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
    Option.none()
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
  const currentFields = (value: typeof LibraryEditorValues.Encoded) =>
    Option.filter(
      AsyncResult.value(settings),
      () =>
        AsyncResult.isSuccess(settings) &&
        !settings.waiting &&
        Option.isNone(pending) &&
        value.settingsFor !== null &&
        sameSettingsRequest({ first: value.settingsFor, second: value }) &&
        Option.exists(requested, (request) =>
          sameSettingsRequest({ first: request, second: value })
        )
    );
  const form = useAppForm({
    schema: LibraryEditorValues,
    defaultValues: {
      name: source._tag === 'Edit' ? source.library.name : '',
      type: source._tag === 'Edit' ? source.library.type : 'audiobook',
      storagePluginId: source._tag === 'Edit' ? source.library.storagePluginId : 'builtin:local',
      settingsFor: null,
      textValues: {},
      listValues: {},
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
        Effect.flatMap((fields) => saveLibrary({ account, source, values: value, fields }))
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
      const defaults = settingsValues({
        fields: descriptors,
        previous:
          form.state.values.settingsFor?.storagePluginId === requested.value.storagePluginId
            ? Option.some(form.state.values)
            : Option.none(),
      });
      form.setFieldValue('textValues', defaults.textValues, { dontUpdateMeta: true });
      form.setFieldValue('listValues', defaults.listValues, { dontUpdateMeta: true });
      form.setFieldValue('settingsFor', requested.value, { dontUpdateMeta: true });
    }
  );
  useEffect(() => {
    if (AsyncResult.isSuccess(settings) && !settings.waiting) {
      applySettings(settings.value);
    }
  }, [settings]);

  const load = (input: typeof LibraryEditorMetadata.Type) => {
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
        approved.current = Option.some(pending.value.storagePluginId);
        load(pending.value);
        setPending(Option.none());
      }
    },
    handleCancelConsent: () => {
      setPending(Option.none());
      const previous = form.state.values.settingsFor;
      if (previous !== null) {
        form.setFieldValue('storagePluginId', previous.storagePluginId);
        setRequested(decodeMetadata(previous));
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
