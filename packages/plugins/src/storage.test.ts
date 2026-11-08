import { expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { StoragePluginSettingsFieldName, StoragePluginSettingsForm } from '#src/storage.ts';

const decode = Schema.decodeUnknownEffect(StoragePluginSettingsForm);
const encode = Schema.encodeEffect(StoragePluginSettingsForm);

it.effect.each([
  { _tag: 'TextField', initialValue: '' },
  { _tag: 'TextListField', initialValue: [] },
] as const)(
  'requires an explicit, valid purpose for $_tag',
  Effect.fnUntraced(function* (field) {
    const descriptor = {
      ...field,
      name: StoragePluginSettingsFieldName.make('source'),
      label: 'Source',
      placeholder: '',
    };
    for (const purpose of ['text', 'name', 'username', 'email', 'url'] as const) {
      const value = [{ ...descriptor, purpose }];
      const form = StoragePluginSettingsForm.make(value);
      const decoded = yield* decode(value);
      expect(decoded).toEqual(form);
      const encoded = yield* encode(form);
      expect(encoded).toEqual(value);
    }
    const missing = yield* decode([descriptor]).pipe(Effect.flip);
    expect(missing).toMatchObject({ _tag: 'SchemaError' });
    for (const purpose of [void 0, null, 'invalid']) {
      const invalid = yield* decode([{ ...descriptor, purpose }]).pipe(Effect.flip);
      expect(invalid).toMatchObject({ _tag: 'SchemaError' });
    }
  })
);
