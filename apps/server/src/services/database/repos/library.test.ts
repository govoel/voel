import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Schema, SchemaGetter } from 'effect';

import { DatabaseDecodeError, DatabaseNoSuchElementError } from '@repo/spec-api/database/index.ts';
import { LibraryTable, MediaTypes } from '@repo/spec-api/database/library.ts';

import { ApiConfig } from '#src/services/config.ts';
import { DatabaseLive } from '#src/services/database/index.ts';
import { LibraryRepository } from '#src/services/database/repos/library.ts';

const makeTestLayer = () =>
  LibraryRepository.layer.pipe(
    Layer.provideMerge(DatabaseLive),
    Layer.provideMerge(ApiConfig.layerTest())
  );

const forceBrandLibraryId = Schema.decodeEffect(
  Schema.Number.pipe(
    Schema.decodeTo(LibraryTable.fields.id, {
      decode: SchemaGetter.transform((i) => i),
      encode: SchemaGetter.transform((i) => i),
    })
  )
);

it.layer(makeTestLayer())('library repository database error wrapping', (iit) => {
  iit.effect(
    'upsert keeps an inner no-such-element database error unchanged',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;

      const error = yield* repository
        .upsert({
          id: Option.some(yield* forceBrandLibraryId(999_999)),
          type: 'movie',
          name: 'Missing Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(DatabaseNoSuchElementError);
      expect(error.operation).toBe('LibraryRepository.upsertLibrary.nse');
    })
  );

  iit.effect(
    'upsert keeps an inner decode database error unchanged',
    Effect.fnUntraced(function* () {
      const repository = yield* LibraryRepository;

      const error = yield* repository
        .upsert({
          id: Option.none(),
          // @ts-expect-error -- this is an invalid media type, but we want to test the error handling of the repository
          type: 'podcast',
          name: 'Invalid Type Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(DatabaseDecodeError);
      expect(error.operation).toBe('LibraryRepository.upsertLibrary.schema');
    })
  );
});
