import { describe, expect, it } from '@effect/vitest';
import { StoragePluginSettingsForms } from '@govoel/plugins/storage';
import { Array, Effect, Option, Schema } from 'effect';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import {
  LibraryEditorValues,
  libraryEditorDefaults,
  supportedMediaTypes,
} from '#src/domains/library/editor/schema.ts';

const storagePluginId = Library.jsonCreate.fields.storagePluginId.make('builtin:local');

const forms = StoragePluginSettingsForms.decodeEffect({
  show: [
    {
      kind: 'TextField',
      name: 'host',
      label: 'Host',
      placeholder: 'media.example.com',
      purpose: 'url',
      initialValue: 'shows.example.com',
    },
  ],
  audiobook: [
    {
      kind: 'TextListField',
      name: 'roots',
      label: 'Directories',
      placeholder: '/path/to/media',
      purpose: 'text',
      initialValue: ['/books'],
    },
  ],
});

const validate = (value: unknown) =>
  Effect.promise(async () =>
    Schema.toStandardSchemaV1(LibraryEditorValues)['~standard'].validate(value)
  );

describe('library editor schema', () => {
  it.effect(
    'lists supported media types in display order and starts each with its initial settings',
    Effect.fnUntraced(function* () {
      const decoded = yield* forms;
      const mediaTypes = supportedMediaTypes(decoded);
      expect(Array.map(mediaTypes, ({ type }) => type)).toEqual(['audiobook', 'show']);
      const nonEmpty = Option.getOrThrow(
        Array.match(mediaTypes, {
          onEmpty: () => Option.none(),
          onNonEmpty: Option.some,
        })
      );

      const kept = libraryEditorDefaults({
        draft: { name: 'TV', type: Option.some('show') },
        storagePluginId,
        mediaTypes: nonEmpty,
      });
      expect(kept).toEqual({
        name: 'TV',
        type: 'show',
        storagePluginId: 'builtin:local',
        storagePluginSettings: {
          audiobook: { roots: ['/books'] },
          show: { host: 'shows.example.com' },
        },
      });

      const fallback = libraryEditorDefaults({
        draft: { name: '', type: Option.some('movie') },
        storagePluginId,
        mediaTypes: nonEmpty,
      });
      expect(fallback.type).toBe('audiobook');
    })
  );

  it.effect(
    "decodes the trimmed name and the selected type's settings into the save payload",
    Effect.fnUntraced(function* () {
      const result = yield* validate({
        name: '  Books  ',
        type: 'audiobook',
        storagePluginId: 'builtin:local',
        storagePluginSettings: {
          audiobook: { roots: ['/books', '/more-books'] },
          show: { host: 'shows.example.com' },
        },
      });
      expect(result).toEqual({
        value: {
          name: 'Books',
          type: 'audiobook',
          storagePluginId: 'builtin:local',
          storagePluginSettings: { roots: ['/books', '/more-books'] },
        },
      });
    })
  );

  it.effect(
    'reports a blank name and an unsupported media type on their fields',
    Effect.fnUntraced(function* () {
      const blank = yield* validate({
        name: '   ',
        type: 'audiobook',
        storagePluginId: 'builtin:local',
        storagePluginSettings: { audiobook: { roots: [] } },
      });
      expect(blank.issues).toEqual([{ path: ['name'], message: 'Enter a name' }]);

      const unsupported = yield* validate({
        name: 'Movies',
        type: 'movie',
        storagePluginId: 'builtin:local',
        storagePluginSettings: { audiobook: { roots: [] } },
      });
      expect(unsupported.issues).toEqual([
        { path: ['type'], message: 'The storage plugin doesn’t support this media type' },
      ]);
    })
  );
});
