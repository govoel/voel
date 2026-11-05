import { Option, Schema, String } from 'effect';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

export const libraryTypeLabels = {
  audiobook: 'Audiobooks',
  movie: 'Movies',
  show: 'Shows',
} as const;

export const libraryTypeLabel = (type: keyof typeof libraryTypeLabels) => libraryTypeLabels[type];

export const LibraryNameInput = Library.jsonCreate.fields.name.check(
  Schema.makeFilter((name) => String.trim(name).length > 0, { message: 'Enter a library name.' })
);

export class RootRow extends Schema.Struct({
  key: Schema.String,
  root: Schema.String.check(
    Schema.makeFilter((root) => root.length > 0, {
      message: 'Enter a folder path or remove this row.',
    })
  ),
}) {}

let nextRootKey = 0;
export const newRootRow = (root = '') => {
  nextRootKey += 1;
  return { key: `${nextRootKey}`, root };
};

export const parseLibraryId = (id: unknown) =>
  typeof id === 'string' && /^(?:0|[1-9]\d*)$/u.test(id) && Number.isSafeInteger(Number(id))
    ? Schema.decodeOption(Library.fields.id)(Number(id))
    : Option.none();
