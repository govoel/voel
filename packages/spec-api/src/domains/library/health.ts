import {
  StoragePluginConstructionError,
  StoragePluginSettingsConstructionError,
} from '@govoel/plugins/storage';
import { Schema } from 'effect';

import { PluginLoadError } from '#src/domains/plugins/schema.ts';
import { StoragePluginLoadError } from '#src/domains/plugins/storage.ts';

/** Cached construction state of storage and its settings editor, not a live health probe. */
export const StoragePluginStatus = Schema.Literals(['unknown', 'healthy', 'unhealthy']);

/** Any cached failure wins; healthy means at least one current component was built successfully. */
export const StoragePluginHealth = Schema.Union([
  Schema.Struct({ status: Schema.Literal('unknown') }),
  Schema.Struct({ status: Schema.Literal('healthy') }),
  Schema.Struct({
    status: Schema.Literal('unhealthy'),
    errors: Schema.NonEmptyArray(
      Schema.Union([
        PluginLoadError,
        StoragePluginLoadError,
        StoragePluginConstructionError,
        StoragePluginSettingsConstructionError,
      ])
    ),
  }),
]);
