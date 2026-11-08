import { Library } from '@govoel/plugins/library';
import { StoragePluginSettingsPersisted } from '@govoel/plugins/storage';
import { Schema } from 'effect';

import { StoragePluginId } from '@repo/spec-api/domains/plugins/storage.ts';

export class StoragePluginKey extends Schema.Class<
  StoragePluginKey,
  { readonly brand: unique symbol }
>('@repo/server/domains/plugins/storage/schema/StoragePluginKey')({
  storagePlugin: StoragePluginId,
  library: Library,
  settings: StoragePluginSettingsPersisted,
}) {}
