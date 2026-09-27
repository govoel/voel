import type { Effect, SchemaIssue } from 'effect';
import { Context, Schema, SchemaGetter } from 'effect';

export const StorageRootLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@repo/spec-api/storage/StorageRootLocation')
);

export const StorageMediaFileLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@repo/spec-api/storage/StorageMediaFileLocation')
);

export class Storage extends Context.Service<
  Storage,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument
  {
    readonly validateLocation: (request: {
      readonly kind: 'file' | 'root';
      readonly location: string;
    }) => Effect.Effect<string, SchemaIssue.Issue>;
  }
>()('@repo/spec-api/storage') {}

const validateLocation = ({ kind }: { readonly kind: 'file' | 'root' }) =>
  SchemaGetter.transformEffect((location: string) =>
    Storage.use((storage) => storage.validateLocation({ kind, location }))
  );

export const StorageRootLocationFromString = Schema.NonEmptyString.pipe(
  Schema.decodeTo(StorageRootLocation, {
    decode: validateLocation({ kind: 'root' }),
    encode: SchemaGetter.passthrough(),
  })
);

export const StorageMediaFileLocationFromString = Schema.NonEmptyString.pipe(
  Schema.decodeTo(StorageMediaFileLocation, {
    decode: validateLocation({ kind: 'file' }),
    encode: SchemaGetter.passthrough(),
  })
);
