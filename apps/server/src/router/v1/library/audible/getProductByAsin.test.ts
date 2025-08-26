import { describe, expect, test } from 'bun:test';
import { Effect, Layer, LogLevel, Logger, ParseResult } from 'effect';

import { Audible, ProductBookSchema, ProductSeriesSchema } from '@/router/v1/library/audible';

const createProgram = (asin: string) =>
  Effect.gen(function* () {
    const audible = yield* Audible;
    return yield* audible.getProductByAsin({ asin });
  });

const layer = Layer.merge(Logger.minimumLogLevel(LogLevel.None), Audible.Default);

const sortProduct = (product: typeof ProductBookSchema.Type | typeof ProductSeriesSchema.Type) =>
  product.content_delivery_type === 'BookSeries'
    ? {
        ...product,
        authors: [...product.authors].sort((a, b) => a.name.localeCompare(b.name)),
        relationships: product.relationships
          ? [...product.relationships].sort(
              (a, b) => a.sort - b.sort || a.asin.localeCompare(b.asin)
            )
          : undefined,
      }
    : {
        ...product,
        contributors: [...product.contributors].sort((a, b) => a.name.localeCompare(b.name)),
        relationships: product.relationships
          ? [...product.relationships].sort(
              (a, b) => a.sort - b.sort || a.asin.localeCompare(b.asin)
            )
          : undefined,
        series: product.series
          ? [...product.series].sort((a, b) => a.title.localeCompare(b.title))
          : undefined,
      };

describe('books', () => {
  test('author without ASIN', async () => {
    const result = await Effect.runPromise(createProgram('B0DT29BJGC').pipe(Effect.provide(layer)));

    expect(sortProduct(result)).toMatchSnapshot();
  });

  describe('authors transform to editors/translators', () => {
    test('has author and translator', async () => {
      const result = await Effect.runPromise(
        createProgram('B0DXRD5C4F').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });

    test('has author and translators', async () => {
      const result = await Effect.runPromise(
        createProgram('197734447X').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });

    test('has authors and translator', async () => {
      const result = await Effect.runPromise(
        createProgram('B0F257T6XN').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });

    test('has author and editor', async () => {
      const result = await Effect.runPromise(
        createProgram('1400170052').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });

    test('has author and non-conformant editor', async () => {
      const result = await Effect.runPromise(
        createProgram('B004HGZW06').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });

    test('has editors and narrators only (no authors)', async () => {
      const result = await Effect.runPromise(
        createProgram('B0DVLXQ8QM').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });

    test('has editors, foreword by, and narrators only (no authors)', async () => {
      const result = await Effect.runPromise(
        createProgram('B0DV17RHSW').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });

    test('has no narrators and no product_images', async () => {
      const result = await Effect.runPromise(
        createProgram('B0FLYHTBS3').pipe(Effect.provide(layer))
      );

      expect(sortProduct(result)).toMatchSnapshot();
    });
  });

  describe('podcast fails with ParseError', () => {
    test('PodcastParent', async () => {
      const result = await Effect.runPromise(
        createProgram('B08LKMGRF4').pipe(Effect.provide(layer), Effect.flip)
      );

      expect(result).toBeInstanceOf(ParseResult.ParseError);
    });

    test('PodcastEpisode', async () => {
      const result = await Effect.runPromise(
        createProgram('B0FM3SMDB9').pipe(Effect.provide(layer), Effect.flip)
      );

      expect(result).toBeInstanceOf(ParseResult.ParseError);
    });
  });

  test('books part of a bundle parse correctly and narrator has ASIN', async () => {
    const result = await Effect.runPromise(createProgram('B002UUKHII').pipe(Effect.provide(layer)));

    expect(sortProduct(result)).toMatchSnapshot();
  });

  test('abridged books parse correctly and translator has ASIN', async () => {
    const result = await Effect.runPromise(createProgram('B002V8KQUI').pipe(Effect.provide(layer)));

    expect(sortProduct(result)).toMatchSnapshot();
  });

  test('adult books parse correctly', async () => {
    const result = await Effect.runPromise(createProgram('B0FDH3GFZW').pipe(Effect.provide(layer)));

    expect(sortProduct(result)).toMatchSnapshot();
  });

  test('summary is in markdown format', async () => {
    const result = await Effect.runPromise(createProgram('1774241307').pipe(Effect.provide(layer)));

    expect(sortProduct(result)).toMatchSnapshot();
  });
});

describe('series', () => {
  test('summary is in markdown format', async () => {
    const result = await Effect.runPromise(createProgram('B085CDYDYS').pipe(Effect.provide(layer)));

    expect(sortProduct(result)).toMatchSnapshot();
  });
});
