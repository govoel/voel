import { expect, it } from '@effect/vitest';
import { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Effect, Schema } from 'effect';

import { libraryFormSchema, settingsDefaults } from '#src/domains/library/editor.ts';

it.effect(
  'keeps compatible edits and submits only settings from the current plugin form',
  Effect.fnUntraced(function* () {
    const fields = yield* Schema.decodeEffect(StoragePluginSettingsForm)([
      {
        kind: 'TextField',
        name: 'retained',
        label: 'Retained',
        placeholder: '',
        purpose: 'text',
        initialValue: 'default',
      },
      {
        kind: 'TextField',
        name: 'constructor',
        label: 'Constructor',
        placeholder: '',
        purpose: 'text',
        initialValue: 'safe default',
      },
      {
        kind: 'TextListField',
        name: 'changed',
        label: 'Changed',
        placeholder: '',
        purpose: 'text',
        initialValue: ['new shape'],
      },
    ]);
    const previous = { retained: 'user edit', changed: 'old shape', removed: 'old value' };
    const values = yield* Schema.decodeEffect(libraryFormSchema(fields))({
      name: 'Library',
      type: 'movie',
      storagePluginId: 'builtin:local',
      storagePluginSettings: { ...previous, ...settingsDefaults({ fields, previous }) },
    });
    expect(values.storagePluginSettings).toEqual({
      retained: 'user edit',
      constructor: 'safe default',
      changed: ['new shape'],
    });
  })
);
