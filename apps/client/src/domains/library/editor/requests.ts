import { Effect, Option } from 'effect';
import { Atom, Reactivity } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiClientMap } from '#src/api-client.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { LibraryEditorSource } from '#src/domains/library/editor/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

/** Loads a plugin's settings forms, seeded with the library's saved settings when editing. */
export const loadStorageSettingsForms = Effect.fnUntraced(function* ({
  account,
  source,
  storagePluginId,
}: {
  readonly account: AccountKey;
  readonly source: LibraryEditorSource;
  readonly storagePluginId: typeof Library.jsonCreate.fields.storagePluginId.Type;
}) {
  const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
  const forms = yield* client.library.getStoragePluginSettingsForms({
    payload: {
      id: LibraryEditorSource.$match(source, {
        Create: () => Option.none(),
        Edit: ({ library }) => Option.some(library.id),
      }),
      storagePluginId,
    },
  });
  return { storagePluginId, forms };
});

/**
 * Everything the editor needs before it can show the form: the library being edited, if any, and
 * the forms for its plugin. Deliberately not reactive, so a save can't reset an open form.
 */
export const libraryEditorAtom = Atom.family(
  ({
    account,
    id,
  }: {
    readonly account: AccountKey;
    readonly id: Option.Option<typeof Library.fields.id.Type>;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* () {
        const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
        const source = yield* Option.match(id, {
          onNone: () => Effect.succeed(LibraryEditorSource.Create()),
          onSome: (libraryId) =>
            client.library
              .get({ params: { id: libraryId } })
              .pipe(Effect.map((library) => LibraryEditorSource.Edit({ library }))),
        });
        const storage = yield* loadStorageSettingsForms({
          account,
          source,
          storagePluginId: LibraryEditorSource.$match(source, {
            Create: () => Library.jsonCreate.fields.storagePluginId.make('builtin:local'),
            Edit: ({ library }) => library.storagePluginId,
          }),
        });
        return { source, storage };
      })
    ).pipe(Atom.withLabel('libraryEditorAtom'))
);

export const saveLibrary = Effect.fnUntraced(
  function* ({
    account,
    source,
    values,
  }: {
    readonly account: AccountKey;
    readonly source: LibraryEditorSource;
    readonly values: typeof Library.jsonCreate.Type;
  }) {
    const client = yield* ApiClientMap.use((clients) => clients.acquire(account));
    return yield* LibraryEditorSource.$match(source, {
      Create: () => client.library.create({ payload: values }),
      Edit: ({ library }) => client.library.update({ params: { id: library.id }, payload: values }),
    });
  },
  Reactivity.mutation(['library'])
);
