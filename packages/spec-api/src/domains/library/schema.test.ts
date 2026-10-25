import { describe, expect, it } from 'bun:test';

import { DateTime, Effect, Match, Option, Record, Schema, SchemaAST } from 'effect';
import { Model } from 'effect/schema';

import {
  Audiobook,
  AudiobookContributor,
  AudiobookContributorMap,
  AudiobookSeries,
  AudiobookSeriesMap,
  Library,
  LibraryFileMap,
  LibraryRoot,
  MediaFile,
  MediaItem,
} from '#src/domains/library/schema.ts';

const timestamps = { createdAt: 1000, updatedAt: 2000 };
const softDeleteTimestamps = { ...timestamps, deletedAt: null };
const libraryInput = {
  id: 1,
  type: 'audiobook',
  name: 'Books',
  storagePlugin: 'builtin:local',
} as const;
const rootInput = { libraryId: 1, root: '/books' };

const fixtures = [
  { model: MediaItem, fields: { id: 1, type: 'audiobook' }, softDelete: true },
  {
    model: Audiobook,
    fields: {
      id: 1,
      asin: null,
      mediaItemId: 2,
      title: 'A book',
      subtitle: null,
      cover: null,
      coverThumbhash: null,
      summary: null,
    },
    softDelete: true,
  },
  {
    model: AudiobookSeries,
    fields: { id: 1, asin: 'series', name: 'A series', summary: null },
    softDelete: true,
  },
  {
    model: AudiobookSeriesMap,
    fields: {
      id: 1,
      audiobookId: 2,
      audiobookSeriesId: null,
      title: 'A series',
      label: '1',
      sort: 0,
    },
    softDelete: true,
  },
  {
    model: AudiobookContributor,
    fields: {
      id: 1,
      asin: 'contributor',
      name: 'An author',
      about: null,
      avatar: null,
      avatarThumbhash: null,
    },
    softDelete: true,
  },
  {
    model: AudiobookContributorMap,
    fields: {
      id: 1,
      audiobookId: 2,
      audiobookContributorId: null,
      name: 'An author',
      role: 'author',
    },
    softDelete: true,
  },
  {
    model: MediaFile,
    fields: { id: 1, location: '/books/book.m4b', durationMs: 3000 },
    softDelete: true,
  },
  {
    model: LibraryFileMap,
    fields: {
      id: 1,
      libraryId: 2,
      mediaFileId: 3,
      mediaItemId: null,
      matchFailureReason: null,
      variant: 'original',
      customOrder: 0,
    },
    softDelete: true,
  },
  {
    model: Library,
    fields: { ...libraryInput, storagePluginSettings: '{"folder":"books"}' },
    softDelete: false,
  },
  { model: LibraryRoot, fields: { id: 1, ...rootInput }, softDelete: false },
] as const;

describe('library database model inheritance', () => {
  for (const { model, fields, softDelete } of fixtures) {
    describe(model.identifier, () => {
      const row = { ...fields, ...(softDelete ? softDeleteTimestamps : timestamps) };
      const json =
        model === Library
          ? { ...row, storagePluginSettings: Option.some({ folder: 'books' }) }
          : row;

      it('preserves inherited and model-specific fields and codecs in read variants', async () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const selected = yield* Schema.decodeUnknownEffect(model)(row);
            expect(selected).toBeInstanceOf(model);
            expect(DateTime.toEpochMillis(selected.createdAt)).toBe(timestamps.createdAt);
            expect(DateTime.toEpochMillis(selected.updatedAt)).toBe(timestamps.updatedAt);
            const encodedSelected: unknown = yield* Schema.encodeUnknownEffect(model)(selected);
            expect(encodedSelected).toEqual(row);

            for (const variant of ['select', 'json'] as const) {
              const schema = model[variant];
              const encoded = variant === 'select' ? row : json;
              expect(Record.keys<string, unknown>(schema.fields).sort()).toEqual(
                Record.keys<string, unknown>(row).sort()
              );
              expect(SchemaAST.resolveAt<string>('id')(schema.ast)).toBe(
                `${model.identifier}.${variant}`
              );
              const decoded = yield* Schema.decodeUnknownEffect(schema)(encoded);
              const reencoded: unknown = yield* Schema.encodeUnknownEffect(schema)(decoded);
              expect(reencoded).toEqual(encoded);
              expect(
                (yield* Effect.flip(
                  Schema.decodeUnknownEffect(schema)({ ...encoded, createdAt: 'invalid' })
                ))._tag
              ).toBe('SchemaError');
              expect(
                (yield* Effect.flip(Schema.decodeUnknownEffect(schema)({ ...encoded, id: -1 })))
                  ._tag
              ).toBe('SchemaError');
            }

            // Extraction must not reuse a parent's or sibling's cached variant.
            const extracted = Model.extract(model, 'json');
            expect(Record.keys<string, unknown>(extracted.fields).sort()).toEqual(
              Record.keys<string, unknown>(row).sort()
            );
            const decodedJson = yield* Schema.decodeUnknownEffect(extracted)(json);
            const encodedJson: unknown = yield* Schema.encodeUnknownEffect(extracted)(decodedJson);
            expect(encodedJson).toEqual(json);
          })
        ));

      it('omits generated timestamps and preserves model-specific write variants', async () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const writes = Match.value(model).pipe(
              Match.when(
                (candidate) => candidate === Library,
                () => ({
                  create: libraryInput,
                  upsert: {},
                  jsonCreate: { type: 'audiobook', name: 'Books', storagePlugin: 'builtin:local' },
                  jsonUpdate: { name: 'Books' },
                  jsonUpsert: {},
                })
              ),
              Match.when(
                (candidate) => candidate === LibraryRoot,
                () => ({
                  create: {},
                  upsert: rootInput,
                  jsonCreate: {},
                  jsonUpdate: {},
                  jsonUpsert: { root: '/books' },
                })
              ),
              Match.orElse(() => ({
                create: {},
                upsert: {},
                jsonCreate: {},
                jsonUpdate: {},
                jsonUpsert: {},
              }))
            );

            for (const variant of [
              'create',
              'upsert',
              'jsonCreate',
              'jsonUpdate',
              'jsonUpsert',
            ] as const) {
              const schema = model[variant];
              const input = writes[variant];
              expect(Record.keys<string, unknown>(schema.fields).sort()).toEqual(
                Record.keys<string, unknown>(input).sort()
              );
              expect(SchemaAST.resolveAt<string>('id')(schema.ast)).toBe(
                `${model.identifier}.${variant}`
              );
              const decoded = yield* Schema.decodeEffect(schema)(input);
              expect(decoded).toEqual(input);
              const encoded: unknown = yield* Schema.encodeUnknownEffect(schema)(decoded);
              expect(encoded).toEqual(input);
            }
          })
        ));

      it('preserves the timestamp-only versus soft-delete distinction', async () =>
        Effect.runPromise(
          Effect.gen(function* () {
            for (const variant of ['select', 'json'] as const) {
              const schema = model[variant];
              const input: Record.ReadonlyRecord<string, unknown> =
                variant === 'select' ? row : json;
              const decoded = yield* Schema.decodeUnknownEffect(schema)({
                ...input,
                deletedAt: 3000,
              });
              if (softDelete) {
                expect(decoded).toHaveProperty('deletedAt', DateTime.makeUnsafe(3000));
                const withoutDeletedAt = Record.filter(input, (_, key) => key !== 'deletedAt');
                expect(
                  (yield* Effect.flip(Schema.decodeUnknownEffect(schema)(withoutDeletedAt)))._tag
                ).toBe('SchemaError');
              } else {
                expect(decoded).not.toHaveProperty('deletedAt');
              }
            }
          })
        ));
    });
  }

  it('keeps library settings codecs distinct between database and JSON variants', async () => {
    const row = { ...libraryInput, ...timestamps, storagePluginSettings: '{"folder":"books"}' };
    const selected = await Effect.runPromise(Schema.decodeEffect(Library)(row));
    expect(selected.storagePluginSettings).toMatchObject(Option.some({ folder: 'books' }));
    expect(await Effect.runPromise(Schema.encodeEffect(Library)(selected))).toEqual(row);
    const json = await Effect.runPromise(Schema.encodeEffect(Library.json)(selected));
    expect(json.storagePluginSettings).toEqual(Option.some({ folder: 'books' }));
    const decodedJson = await Effect.runPromise(Schema.decodeEffect(Library.json)(json));
    expect(decodedJson.storagePluginSettings).toEqual(selected.storagePluginSettings);
  });
});
