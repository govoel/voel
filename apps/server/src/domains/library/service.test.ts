import { assert, expect, it } from '@effect/vitest';
import { StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Effect, Layer, Option } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { Library, LibraryInvalidRootError } from '@repo/spec-api/domains/library/schema.ts';

import { ApiConfig } from '#src/config.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { LibraryService } from '#src/domains/library/service.ts';
import { pluginLayer } from '#src/domains/library/testing.ts';

// No HTTP handlers, middleware, or auth database participate in this workflow.
const testLayer = LibraryService.layerNoDeps.pipe(
  Layer.provideMerge([LibraryRepository.layerNoDeps, pluginLayer]),
  Layer.provideMerge(LibraryDatabase.layerNoDeps),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer])
);

it.layer(testLayer)('library service without transport', (iit) => {
  iit.effect(
    'reports a raw empty root as a typed validation error without changing configured roots',
    Effect.fnUntraced(function* () {
      const service = yield* LibraryService;
      const library = yield* service.create({
        name: Library.fields.name.make('Direct root validation'),
        type: Library.fields.type.make('movie'),
        storagePlugin: Library.fields.storagePlugin.make('npm:test'),
      });
      yield* service.setStoragePluginSettings({
        ...library,
        input: StoragePluginSettingsInput.make({ root: '/configured' }),
      });
      yield* service.setRoots({ ...library, roots: [{ root: '/one' }, { root: '/two' }] });
      const before = yield* service.get(library);
      expect(before.storagePluginSettings).toEqual(Option.some({ prefix: '/configured' }));
      expect(before.roots.map(({ root }) => root)).toEqual(['/one', '/two']);

      // HTTP rejects the empty string before the service can validate it.
      const error = yield* service
        .setRoots({ ...library, roots: [{ root: '/replacement' }, { root: '' }] })
        .pipe(Effect.flip);
      assert.instanceOf(error, LibraryInvalidRootError);
      expect({ _tag: error._tag, roots: error.roots }).toEqual({
        _tag: 'LibraryInvalidRootError',
        roots: [{ root: '', message: 'Expected a value with a length of at least 1' }],
      });
      // Preserve root IDs and settings without coupling the check to cached health.
      const after = yield* service.get(library);
      expect({ settings: after.storagePluginSettings, roots: after.roots }).toEqual({
        settings: Option.some({ prefix: '/configured' }),
        roots: before.roots,
      });
    })
  );
});
