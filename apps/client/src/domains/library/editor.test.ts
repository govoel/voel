import { expect, it } from '@effect/vitest';
import { StoragePluginSettingsForm } from '@govoel/plugins/storage';
import { Effect, Option, Schema } from 'effect';

import {
  LibraryEditorValues,
  newSettingsEntry,
  settingsSubmission,
  settingsValues,
} from '#src/domains/library/editor.ts';

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
    const previous = {
      textValues: { retained: 'user edit', changed: 'old shape', removed: 'old value' },
      listValues: { removedList: [newSettingsEntry({ value: 'old list' })] },
    };
    const defaults = settingsValues({ fields, previous: Option.some(previous) });
    const values = yield* Schema.decodeEffect(LibraryEditorValues)({
      name: 'Library',
      type: 'movie',
      storagePluginId: 'builtin:local',
      settingsFor: null,
      textValues: { ...previous.textValues, ...defaults.textValues },
      listValues: { ...previous.listValues, ...defaults.listValues },
    });
    const submitted = yield* settingsSubmission({ fields, values });
    expect(submitted).toEqual({
      retained: 'user edit',
      constructor: 'safe default',
      changed: ['new shape'],
    });
  })
);
