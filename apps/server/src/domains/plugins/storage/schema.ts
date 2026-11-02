import { Library } from '@govoel/plugins/library';
import { StoragePluginSettingsPersisted } from '@govoel/plugins/storage';
import { Schema } from 'effect';

import { StoragePluginId } from '@repo/spec-api/domains/plugins/storage.ts';

export class StoragePluginSettingsKey extends Schema.Class<
  StoragePluginSettingsKey,
  { readonly brand: unique symbol }
>('@repo/server/domains/plugins/storage/schema/StoragePluginSettingsKey')({
  storagePlugin: StoragePluginId,
  library: Library,
}) {}

export class StoragePluginKey extends Schema.Class<
  StoragePluginKey,
  { readonly brand: unique symbol }
>('@repo/server/domains/plugins/storage/schema/StoragePluginKey')({
  ...StoragePluginSettingsKey.fields,
  settings: StoragePluginSettingsPersisted,
}) {}
