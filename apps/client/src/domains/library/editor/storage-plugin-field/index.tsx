import { Effect, Function, Match, Option, Schema, SchemaGetter, String } from 'effect';
import type { ComponentProps, ComponentType } from 'react';

import { Library } from '@repo/spec-api/domains/library/schema.ts';
import { NpmPluginId } from '@repo/spec-api/domains/plugins/schema.ts';

import { useAppForm } from '#src/components/form';

export const storageProviders = ['local', 'npm'] as const;

export const storageProviderOptionLabel = (provider: (typeof storageProviders)[number]) =>
  Match.value(provider).pipe(
    Match.literalsExhaustive({
      local: () => 'Local folders',
      npm: () => 'npm package',
    })
  );

class PluginPackage extends Schema.Struct({
  package: Schema.Trim.check(Schema.isNonEmpty({ message: 'Enter a package name' })).pipe(
    Schema.decodeTo(Library.jsonCreate.fields.storagePluginId, {
      decode: SchemaGetter.transform((name) => `npm:${name}`),
      encode: SchemaGetter.forbiddenEncoding,
    })
  ),
}) {}

/**
 * Local storage loads as soon as it's selected. An npm package installs and runs on the server, so
 * it only loads once the user enters it and asks to.
 */
export const useStoragePluginField = ({
  storagePluginId,
  onChange,
}: Pick<ComponentProps<typeof StoragePluginField>, 'storagePluginId' | 'onChange'>) => {
  const provider = Option.match(storagePluginId, {
    onNone: () => 'npm' as const,
    onSome: (id) => (id === 'builtin:local' ? ('local' as const) : ('npm' as const)),
  });
  const packageForm = useAppForm({
    schema: PluginPackage,
    defaultValues: {
      package: Option.match(Option.filter(storagePluginId, NpmPluginId.is), {
        onNone: () => '',
        onSome: String.slice('npm:'.length),
      }),
    },
    onSubmit: ({ value }) => Effect.succeed(value.package),
    onFailure: ({ error }) => Function.absurd(error),
    onSuccess: ({ result }) => {
      onChange(Option.some(result));
    },
  });
  return {
    provider,
    packageForm,
    selectProvider: (selected: (typeof storageProviders)[number]) => {
      if (selected === provider) {
        return;
      }
      onChange(
        Match.value(selected).pipe(
          Match.literalsExhaustive({
            local: () =>
              Option.some(Library.jsonCreate.fields.storagePluginId.make('builtin:local')),
            npm: () => Option.none(),
          })
        )
      );
    },
  };
};

export declare const StoragePluginField: ComponentType<{
  /** The plugin whose settings are shown, or none while an npm package is being entered. */
  readonly storagePluginId: Option.Option<typeof Library.jsonCreate.fields.storagePluginId.Type>;
  readonly disabled: boolean;
  readonly onChange: (
    storagePluginId: Option.Option<typeof Library.jsonCreate.fields.storagePluginId.Type>
  ) => void;
}>;
