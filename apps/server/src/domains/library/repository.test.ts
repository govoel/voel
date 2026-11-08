import { assert, expect, it } from '@effect/vitest';
import { StoragePluginSettingsPersisted } from '@govoel/plugins/storage';
import { Array, Effect, Layer, Option } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiConfig } from '#src/config.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { StoragePluginKey } from '#src/domains/plugins/storage/schema.ts';

const testLayer = LibraryRepository.layerNoDeps.pipe(
  Layer.provideMerge(LibraryDatabase.layerNoDeps),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer])
);

const createInput = ({
  name,
  settings,
}: {
  readonly name: string;
  readonly settings: typeof StoragePluginSettingsPersisted.Type;
}) => ({
  name: Library.fields.name.make(name),
  type: Library.fields.type.make('movie'),
  storagePluginId: Library.fields.storagePluginId.make('builtin:local'),
  storagePluginSettings: settings,
});

it.layer(testLayer)('library repository', (iit) => {
  iit.effect(
    'requires valid settings JSON on insert and update, while preserving JSON null',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;
      const sql = yield* LibraryDatabase;
      const original = yield* repository.create(
        createInput({
          name: 'JSON null settings',
          settings: StoragePluginSettingsPersisted.make(null),
        })
      );
      const library = { id: original.id };
      expect(original.storageKey.settings).toBe(null);
      const listed = yield* repository.list({ cursor: Option.none(), limit: 100 });
      expect(Array.findFirst(listed, (row) => row.id === library.id)).toEqual(
        Option.some(original)
      );
      const rows = yield* sql`
          select
            "storagePluginSettings"
          from
            library
          where
            id = ${library.id}
        `;
      expect(rows).toEqual([{ storagePluginSettings: 'null' }]);

      const omitted = yield* sql`
        insert into
          library (type, name, "storagePluginId")
        values
          ('movie', 'Missing settings', 'builtin:local')
      `.pipe(Effect.flip);
      expect(omitted).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'ConstraintError' } });
      for (const settings of [null, 'not json']) {
        const insertError = yield* sql`
          insert into
            library (
              type,
              name,
              "storagePluginId",
              "storagePluginSettings"
            )
          values
            (
              'movie',
              'Invalid settings',
              'builtin:local',
              ${settings}
            )
        `.pipe(Effect.flip);
        expect(insertError).toMatchObject({
          _tag: 'SqlError',
          reason: { _tag: 'ConstraintError' },
        });
        const updateError = yield* sql`
          update library
          set
            "storagePluginSettings" = ${settings}
          where
            id = ${library.id}
        `.pipe(Effect.flip);
        expect(updateError).toMatchObject({
          _tag: 'SqlError',
          reason: { _tag: 'ConstraintError' },
        });
        const current = yield* repository.getById(library);
        expect(current).toEqual(original);
      }
    })
  );

  iit.effect(
    'creates and updates complete library records, returning persisted storage identities',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;
      const settings = StoragePluginSettingsPersisted.make({ prefix: '/original' });
      const initial = createInput({
        name: 'Original aggregate',
        settings,
      });
      const created = yield* repository.create(initial);
      const library = { id: created.id };
      assert.instanceOf(created.storageKey, StoragePluginKey);
      expect(created).toMatchObject({
        ...library,
        name: initial.name,
        type: initial.type,
        storageKey: {
          library: { ...library, name: initial.name, type: initial.type },
          storagePluginId: initial.storagePluginId,
          settings,
        },
      });
      const stored = yield* repository.getById(library);
      expect(created).toEqual(stored);
      const other = yield* repository.create(createInput({ name: 'Other aggregate', settings }));
      const request = {
        ...initial,
        ...library,
        name: Library.fields.name.make('Updated aggregate'),
        type: Library.fields.type.make('audiobook'),
        storagePluginId: Library.fields.storagePluginId.make('npm:updated'),
        storagePluginSettings: StoragePluginSettingsPersisted.make({ prefix: '/updated' }),
      };
      const updated = yield* repository.update(request);
      assert.instanceOf(updated.storageKey, StoragePluginKey);
      expect(updated).toMatchObject({
        ...library,
        name: request.name,
        type: request.type,
        storageKey: {
          library: { ...library, name: request.name, type: request.type },
          storagePluginId: request.storagePluginId,
          settings: request.storagePluginSettings,
        },
      });
      const persisted = yield* repository.getById(library);
      expect(updated).toEqual(persisted);
      const repeated = yield* repository.update(request);
      expect(repeated).toEqual(updated);
      const unchanged = yield* repository.getById({ id: other.id });
      expect(unchanged).toEqual(other);
    })
  );

  iit.effect(
    'rejects conflicting names and never resurrects a deleted aggregate',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;
      const request = createInput({
        name: 'Unique aggregate',
        settings: StoragePluginSettingsPersisted.make({}),
      });
      const created = yield* repository.create(request);
      const duplicate = yield* repository.create(request).pipe(Effect.flip);
      expect(duplicate).toMatchObject({
        _tag: 'LibraryNameConflictError',
        libraryName: request.name,
      });
      const other = yield* repository.create({
        ...request,
        name: Library.fields.name.make('Other name'),
      });
      const conflicting = {
        ...request,
        id: other.id,
      };
      const conflict = yield* repository.update(conflicting).pipe(Effect.flip);
      expect(conflict).toMatchObject({
        _tag: 'LibraryNameConflictError',
        libraryName: request.name,
      });
      const unchanged = yield* repository.getById({ id: other.id });
      expect(unchanged).toEqual(other);
      const library = { id: created.id };
      yield* repository.deleteById(library);
      const missing = yield* repository.update({ ...request, ...library }).pipe(Effect.flip);
      expect(missing).toMatchObject({ _tag: 'LibraryNotFoundError', ...library });
      const absent = yield* repository.getById(library).pipe(Effect.flip);
      expect(absent).toMatchObject({ _tag: 'LibraryNotFoundError', ...library });
    })
  );
});
