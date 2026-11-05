import { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import type { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Array, Effect, Match, Record, Schema } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import { useAppForm } from '#src/components/form';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { LibraryNameInput, RootRow, libraryTypeLabel } from '#src/domains/library/management.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { swr } from '#src/runtime/swr.ts';

export const libraryAtom = Atom.family(
  ({ account, id }: { readonly account: AccountKey; readonly id: typeof Library.fields.id.Type }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* () {
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        return yield* client.library.get({ params: { id } });
      })
    ).pipe(
      Atom.withReactivity(['library']),
      swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
    )
);
export const settingsFormAtom = Atom.family(
  ({ account, id }: { readonly account: AccountKey; readonly id: typeof Library.fields.id.Type }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* () {
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        return yield* client.library.getStoragePluginSettingsForm({ params: { id } });
      })
    ).pipe(Atom.withReactivity(['library']))
);
type LibraryDetails = Atom.Success<ReturnType<typeof libraryAtom>>;
interface EditorProps {
  readonly library: LibraryDetails;
  readonly onSuccess: () => void | Promise<void>;
}
class NameInput extends Schema.Struct({ name: LibraryNameInput }) {}
class RootsInput extends Schema.Struct({ roots: Schema.Array(RootRow) }) {}
class SettingsInput extends Schema.Struct({
  values: Schema.Record(Schema.String, Schema.String),
}) {}
export const libraryDetails = ({ library }: { readonly library: LibraryDetails }) => [
  { label: 'Name', value: library.name },
  { label: 'Type', value: libraryTypeLabel(library.type) },
  {
    label: 'Storage',
    value: library.storagePlugin === 'builtin:local' ? 'Local' : library.storagePlugin,
  },
  { label: 'Storage health', value: library.storagePluginHealth.status },
  {
    label: 'Roots',
    value:
      library.roots.length > 0
        ? Array.join(
            Array.map(library.roots, ({ root }) => root),
            '\n'
          )
        : 'None',
  },
];
const saveName = Effect.fnUntraced(function* ({
  account,
  id,
  value,
}: {
  account: AccountKey;
  id: typeof Library.fields.id.Type;
  value: typeof NameInput.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  yield* client.library
    .update({ params: { id }, payload: value })
    .pipe(Reactivity.mutation(['library']));
});
const saveRoots = Effect.fnUntraced(function* ({
  account,
  id,
  value,
}: {
  account: AccountKey;
  id: typeof Library.fields.id.Type;
  value: typeof RootsInput.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  yield* client.library
    .setRoots({
      params: { id },
      payload: { roots: Array.map(value.roots, ({ root }) => ({ root })) },
    })
    .pipe(Reactivity.mutation(['library']));
});
const saveSettings = Effect.fnUntraced(function* ({
  account,
  id,
  value,
}: {
  account: AccountKey;
  id: typeof Library.fields.id.Type;
  value: typeof SettingsInput.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  yield* client.library
    .setStoragePluginSettings({
      params: { id },
      payload: { input: yield* Schema.decodeEffect(StoragePluginSettingsInput)(value.values) },
    })
    .pipe(Reactivity.mutation(['library']));
});
export const useLibraryNameForm = ({ library, onSuccess }: EditorProps) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: NameInput,
    defaultValues: { name: library.name },
    onSubmit: ({ value }) => saveName({ account, id: library.id, value }),
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tag('LibraryNameConflictError', () => 'A library with this name already exists.'),
        Match.orElse(() => 'Unable to update the name.')
      ),
    onSuccess,
  });
};
export const useLibraryRootsForm = ({ library, onSuccess }: EditorProps) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: RootsInput,
    defaultValues: {
      roots: Array.map(library.roots, ({ id, root }) => ({ key: `existing-${id}`, root })),
    },
    onSubmit: ({ value }) => saveRoots({ account, id: library.id, value }),
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tag('LibraryInvalidRootError', ({ roots }) =>
          Array.join(
            Array.map(roots, ({ root, message }) => `${root}: ${message}`),
            '\n'
          )
        ),
        Match.tag('LibraryUnconfiguredError', () => 'Configure storage before setting roots.'),
        Match.orElse(() => 'Unable to update roots.')
      ),
    onSuccess,
  });
};
export const useLibrarySettingsForm = ({
  library,
  onSuccess,
  fields,
}: EditorProps & { readonly fields: typeof StoragePluginSettingsForm.Type }) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: SettingsInput,
    defaultValues: {
      values: Record.fromEntries(
        Array.map(fields, ({ name, initialValue }) => [name, initialValue] as const)
      ),
    },
    onSubmit: ({ value }) => saveSettings({ account, id: library.id, value }),
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tag('StoragePluginInvalidSettingsError', ({ message }) => message),
        Match.tag('LibraryInvalidRootError', ({ roots }) =>
          Array.join(
            Array.map(roots, ({ root, message }) => `${root}: ${message}`),
            '\n'
          )
        ),
        Match.orElse(() => 'Unable to save storage settings. Check the values and try again.')
      ),
    onSuccess,
  });
};
