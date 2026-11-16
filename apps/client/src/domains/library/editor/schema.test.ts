import {
  StoragePluginSettingsFieldName,
  StoragePluginSettingsForms,
} from '@govoel/plugins/storage';
import { Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

import {
  LibraryEditorSource,
  LibraryEditorValues,
  requiresPluginConsent,
  storageDraft,
} from '#src/domains/library/editor/schema.ts';

const forms = StoragePluginSettingsForms.make({
  audiobook: [
    {
      kind: 'TextListField',
      name: StoragePluginSettingsFieldName.make('roots'),
      label: 'Directories',
      placeholder: '',
      purpose: 'text',
      initialValue: ['/books'],
    },
  ],
  movie: [
    {
      kind: 'TextField',
      name: StoragePluginSettingsFieldName.make('folder'),
      label: 'Folder',
      placeholder: '',
      purpose: 'text',
      initialValue: '/movies',
    },
  ],
});
const local = Library.jsonCreate.fields.storagePluginId.make('builtin:local');
const decode = Schema.decodeUnknownExit(LibraryEditorValues);
const values = {
  name: 'Library',
  type: 'audiobook',
  storagePluginId: 'builtin:local',
  storage: storageDraft({ storagePluginId: local, forms }),
} satisfies typeof LibraryEditorValues.Encoded;

describe('library editor values', () => {
  it('starts each supported media type at its defaults', () => {
    expect(storageDraft({ storagePluginId: local, forms }).settings).toEqual({
      audiobook: { roots: ['/books'] },
      movie: { folder: '/movies' },
    });
  });

  it('decodes to the payload for the selected media type only', () => {
    expect(decode({ ...values, type: 'movie' })).toEqual(
      Exit.succeed({
        name: 'Library',
        type: 'movie',
        storagePluginId: 'builtin:local',
        storagePluginSettings: { folder: '/movies' },
      })
    );
  });

  it.each([
    { reason: 'the entered plugin is not loaded', input: { storagePluginId: 'npm:other' } },
    { reason: 'the plugin does not support the type', input: { type: 'show' } },
    {
      reason: 'the settings are invalid',
      input: { storage: { ...values.storage, settings: { audiobook: { roots: 'nope' } } } },
    },
  ])('rejects saving when $reason', ({ input }) => {
    expect(Exit.isFailure(decode({ ...values, ...input }))).toBe(true);
  });

  it('asks for consent only for npm plugins the library does not already use', () => {
    const plugin = Library.jsonCreate.fields.storagePluginId.make('npm:@fixture/storage@1.0.0');
    const edit = LibraryEditorSource.Edit({
      library: {
        id: Library.fields.id.make(1),
        name: Library.fields.name.make('Library'),
        type: Library.fields.type.make('audiobook'),
        storagePluginId: plugin,
      },
    });
    expect(
      requiresPluginConsent({ source: LibraryEditorSource.Create(), storagePluginId: local })
    ).toBe(false);
    expect(
      requiresPluginConsent({ source: LibraryEditorSource.Create(), storagePluginId: plugin })
    ).toBe(true);
    expect(requiresPluginConsent({ source: edit, storagePluginId: plugin })).toBe(false);
  });
});
