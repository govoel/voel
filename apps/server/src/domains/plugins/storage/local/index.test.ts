import { BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Library } from '@govoel/plugins/library';
import { StoragePluginSettings, StoragePluginSettingsInput } from '@govoel/plugins/storage';
import { Effect, Layer, Option } from 'effect';

import local from '#src/domains/plugins/storage/local/index.ts';

const library = Library.make({
  id: Library.fields.id.make(1),
  name: Library.fields.name.make('Local'),
  type: Library.fields.type.make('movie'),
});

it.effect.each([
  null,
  {},
  { roots: '/audio' },
  { roots: [123] },
  { roots: [''] },
  { roots: ['relative'] },
  { roots: ['/audio', '/nul\0'] },
])(
  'rejects malformed local directory submissions: %j',
  Effect.fnUntraced(
    function* (value) {
      const editor = yield* StoragePluginSettings;
      const submitted = yield* editor
        .decodeFormSubmission({
          library,
          current: Option.none(),
          input: StoragePluginSettingsInput.make(value),
        })
        .pipe(Effect.flip);
      expect(submitted).toMatchObject({ _tag: 'StoragePluginInvalidSettingsError' });
    },
    Effect.scoped,
    Effect.provide(local.storage.layerSettings.pipe(Layer.provideMerge(BunPath.layer)))
  )
);
