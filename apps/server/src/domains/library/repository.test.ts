import { assert, expect, it } from '@effect/vitest';
import { StoragePluginSettingsPersisted, StorageRootLocation } from '@govoel/plugins/storage';
import { Array, Effect, Exit, Layer, Option } from 'effect';
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
      const library = yield* repository.create(
        createInput({
          name: 'JSON null settings',
          settings: StoragePluginSettingsPersisted.make(null),
        })
      );
      const original = yield* repository.getById(library);
      assert.instanceOf(original.storageKey, StoragePluginKey);
      expect(original.storageKey.settings).toBe(null);
      const listed = yield* repository.list({ cursor: Option.none(), limit: 100 });
      expect(Array.findFirst(listed, (row) => row.storageKey.library.id === library.id)).toEqual(
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
    'replaces roots idempotently, retains surviving IDs, and isolates other libraries',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;
      const settings = StoragePluginSettingsPersisted.make({});
      const library = yield* repository.create(createInput({ name: 'Stable roots', settings }));
      const other = yield* repository.create(createInput({ name: 'Isolated roots', settings }));
      const retained = StorageRootLocation.make('/retained');
      const added = StorageRootLocation.make('/added');
      yield* repository.setRoots({
        ...library,
        roots: [retained, StorageRootLocation.make('/removed')],
      });
      yield* repository.setRoots({ ...other, roots: [retained] });
      const original = (yield* repository.getById(library)).roots;
      const isolated = (yield* repository.getById(other)).roots;
      expect(Array.map(isolated, ({ root }) => root)).toEqual(['/retained']);
      yield* repository.setRoots({ ...library, roots: [retained, added, retained] });
      const replaced = (yield* repository.getById(library)).roots;
      expect(Array.map(replaced, ({ root }) => root)).toEqual([retained, added]);
      expect(replaced[0]).toEqual(original[0]);
      yield* repository.setRoots({ ...library, roots: [added, retained] });
      expect((yield* repository.getById(library)).roots).toEqual(replaced);
      yield* repository.setRoots({ ...library, roots: [] });
      yield* repository.setRoots({ ...library, roots: [] });
      expect((yield* repository.getById(library)).roots).toEqual([]);
      expect((yield* repository.getById(other)).roots).toEqual(isolated);
    })
  );

  iit.effect(
    'replaces settings and roots atomically and idempotently without changing other libraries',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;
      const sql = yield* LibraryDatabase;
      const settings = StoragePluginSettingsPersisted.make({ prefix: '/original' });
      const library = yield* repository.create(createInput({ name: 'Atomic storage', settings }));
      const other = yield* repository.create(createInput({ name: 'Other storage', settings }));
      const retained = StorageRootLocation.make('/retained');
      yield* repository.setRoots({
        ...library,
        roots: [retained, StorageRootLocation.make('/removed')],
      });
      yield* repository.setRoots({ ...other, roots: [retained] });
      const original = yield* repository.getById(library);
      const unrelated = yield* repository.getById(other);
      yield* Effect.acquireRelease(
        sql`
          create trigger "rejectStorageRoots" before insert on "libraryRoot" when new.root = '/rejected' begin
          select
            raise (abort, 'Root insertion rejected');

          end;
        `,
        () =>
          sql`
            drop trigger "rejectStorageRoots"
          `.pipe(Effect.orDie)
      );
      const replacement = StoragePluginSettingsPersisted.make({ prefix: '/replacement' });
      const exit = yield* repository
        .replaceStorage({
          ...library,
          settings: replacement,
          roots: [StorageRootLocation.make('/rejected')],
        })
        .pipe(Effect.exit);
      expect(Exit.findDefect(exit)).toMatchObject({
        _tag: 'Success',
        success: { _tag: 'SqlError' },
      });
      const rolledBack = yield* repository.getById(library);
      expect(rolledBack).toEqual(original);

      const request = {
        ...library,
        settings: replacement,
        roots: [retained, StorageRootLocation.make('/added'), retained],
      };
      yield* repository.replaceStorage(request);
      const replaced = yield* repository.getById(library);
      expect(replaced.storageKey.settings).toEqual(replacement);
      expect(Array.map(replaced.roots, ({ root }) => root)).toEqual(['/retained', '/added']);
      expect(replaced.roots[0]).toEqual(original.roots[0]);
      yield* repository.replaceStorage(request);
      const repeated = yield* repository.getById(library);
      const unchanged = yield* repository.getById(other);
      expect(repeated).toEqual(replaced);
      expect(unchanged).toEqual(unrelated);

      yield* repository.deleteById(library);
      const missing = yield* repository.replaceStorage(request).pipe(Effect.flip);
      expect(missing).toMatchObject({
        _tag: 'LibraryNotFoundError',
        ...library,
      });
    })
  );
});
