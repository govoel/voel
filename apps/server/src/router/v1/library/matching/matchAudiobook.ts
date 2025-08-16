import { Path } from '@effect/platform';
import { Effect, Option, Schema } from 'effect';

import { Audible, BookSearchResponseSchema, ProductBookSchema } from '@/router/v1/library/audible';
import type { GetBooksBySearchRequest } from '@/router/v1/library/audible/getBooksBySearch';

const openingBrackets = new Set(['(', '[', '{']);
const closingBrackets = new Set([')', ']', '}']);
const correspondingOpeningBrackets = new Map([
  [')', '('],
  [']', '['],
  ['}', '{'],
]);

const removeEnclosingContent = (str: string) => {
  const result = [];
  const stack = [];

  for (const char of str) {
    if (openingBrackets.has(char)) {
      // When we see an opening bracket, remember its position
      stack.push(char);
    } else if (closingBrackets.has(char)) {
      // When we see a closing bracket, pop the matching opening bracket
      if (stack.length && stack[stack.length - 1] === correspondingOpeningBrackets.get(char)!) {
        stack.pop();
      }
    } else if (!stack.length) {
      // Only add characters to result if we're not inside any brackets
      result.push(char);
    }
  }

  return result.join('').trim().replace(/ {2,}/g, ' ');
};

const asinRegex = /(?:B[\dA-Z]{9}|\d{9}(?:X|\d))/g;

const parseMultiAuthorNarrator = (str?: string) => {
  if (typeof str !== 'string') return [];

  const separators = [',', '&', ' and ', ';', '/'];

  for (const separator of separators) {
    if (str.includes(separator)) {
      return str.split(separator).map((s) => s.trim());
    }
  }

  return [str.trim()];
};

const matchers = {
  matchStrings: (a?: string, b?: string) =>
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.trim().toLowerCase() === b.trim().toLowerCase(),

  title: (product: (typeof BookSearchResponseSchema.Type)['products'][number], title: string) =>
    matchers.matchStrings(product.title, title),

  artist: (product: (typeof BookSearchResponseSchema.Type)['products'][number], artist: string) =>
    Array.isArray(product.authors) &&
    product.authors.some((author) => matchers.matchStrings(author.name, artist)),

  publisher: (
    product: (typeof BookSearchResponseSchema.Type)['products'][number],
    publisher?: string
  ) => matchers.matchStrings(product.publisher_name, publisher),

  copyright: (
    product: (typeof BookSearchResponseSchema.Type)['products'][number],
    copyright?: string
  ) => matchers.matchStrings(product.copyright, copyright),

  narrator: (
    product: (typeof BookSearchResponseSchema.Type)['products'][number],
    narrators?: Set<string>
  ) => {
    return (
      narrators instanceof Set &&
      Array.isArray(product.narrators) &&
      product.narrators.some((n) =>
        [...narrators].some((name) => matchers.matchStrings(n.name, name))
      )
    );
  },
};

const filters = [
  // Each array represents the fields to check in a strategy
  ['title', 'artist', 'publisher', 'copyright', 'narrator'],
  ['title', 'artist', 'publisher', 'copyright'],
  ['title', 'artist', 'publisher', 'narrator'],
  ['title', 'artist', 'copyright', 'narrator'],
  ['title', 'artist', 'publisher'],
  ['title', 'artist', 'copyright'],
  ['title', 'artist', 'narrator'],
  ['title', 'artist'],
] as const;

const filterStrategies = filters.map((config) => ({
  name: config.join(', '),
  filter: (
    product: (typeof BookSearchResponseSchema.Type)['products'][number],
    title: string,
    artist: string,
    metadata?: { publisher?: string; copyright?: string; narrator?: Set<string> }
  ) =>
    config.every((field) => {
      switch (field) {
        case 'title':
          return matchers.title(product, title);
        case 'artist':
          return matchers.artist(product, artist);
        case 'publisher':
          return matchers.publisher(product, metadata?.publisher);
        case 'copyright':
          return matchers.copyright(product, metadata?.copyright);
        case 'narrator':
          return matchers.narrator(product, metadata?.narrator);
        default:
          return false;
      }
    }),
}));

const processSearchResults = Effect.fn(function* ({
  audible,
  results,
  filterParams: { title, artist, metadata },
}: {
  audible: Audible;
  results: Option.Option<(typeof BookSearchResponseSchema.Type)['products']>;
  filterParams: {
    title: string;
    artist?: string;
    metadata?: { publisher?: string; copyright?: string; narrator?: Set<string> };
  };
}) {
  if (Option.isNone(results) || results.value.length === 0) {
    yield* Effect.logDebug('No books found');
    return Option.none();
  }

  if (results.value.length === 1) {
    yield* Effect.logDebug('Single book found, attempting to fetch full product details');
    const fullProduct = yield* audible
      .getProductByAsin({ asin: results.value[0]!.asin })
      .pipe(Effect.option);

    if (Option.isSome(fullProduct) && Schema.is(ProductBookSchema)(fullProduct.value)) {
      return Option.some(fullProduct.value);
    } else {
      yield* Effect.logDebug("Single search result's ASIN is not a valid book");
      return Option.none();
    }
  }

  if (typeof artist === 'string') {
    yield* Effect.logDebug('Multiple books found, attempting to filter them');
    for (const filterStrategy of filterStrategies) {
      const filteredBooks = results.value.filter((book) =>
        filterStrategy.filter(book, title, artist, metadata)
      );

      if (filteredBooks.length === 1) {
        yield* Effect.logDebug(
          'Single book found after filtering, attempting to fetch full product details'
        );
        const fullProduct = yield* audible
          .getProductByAsin({
            asin: filteredBooks[0]!.asin,
          })
          .pipe(Effect.option);

        if (Option.isSome(fullProduct) && Schema.is(ProductBookSchema)(fullProduct.value)) {
          return Option.some(fullProduct.value);
        } else {
          yield* Effect.logDebug("Single search result's ASIN after filtering is not a valid book");
        }
      } else if (filteredBooks.length > 1) {
        yield* Effect.logDebug('Multiple books found after filtering');
      } else {
        yield* Effect.logDebug('No books found after filtering');
      }
    }
  }

  return Option.none();
});

const getAndProcessSearchResults = Effect.fn(function* ({
  audible,
  searchParams,
  filterParams,
}: {
  audible: Audible;
  searchParams: Parameters<typeof GetBooksBySearchRequest>[0];
  filterParams: {
    title: string;
    artist?: string;
    metadata?: { publisher?: string; copyright?: string; narrator?: Set<string> };
  };
}) {
  const results = yield* audible.getBooksBySearch(searchParams).pipe(Effect.option);

  return yield* processSearchResults({ audible, results, filterParams });
});

const searchStrategies = [
  {
    name: 'Title + Author + Publisher',
    execute: ({
      audible,
      title,
      metadata,
    }: {
      audible: Audible;
      title: string;
      metadata: {
        artists: Set<string>;
        publisher?: string;
        copyright?: string;
        narrator?: Set<string>;
      };
    }) =>
      Effect.if(typeof metadata.publisher === 'string', {
        onTrue: Effect.fn(function* () {
          for (const artist of metadata.artists) {
            const book = yield* getAndProcessSearchResults({
              audible,
              searchParams: {
                title,
                author: artist,
                publisher: metadata.publisher,
              },
              filterParams: {
                title,
                artist,
                metadata,
              },
            });

            if (Option.isSome(book)) return Option.some(book.value);
          }

          return Option.none();
        }),
        onFalse: () => Effect.succeed(Option.none()),
      }).pipe(
        Effect.annotateLogs({
          searchStrategy: 'Title + Author + Publisher',
          title,
          metadata,
        })
      ),
  },
  {
    name: 'Title + Author',
    execute: Effect.fn(
      function* ({
        audible,
        title,
        metadata,
      }: {
        audible: Audible;
        title: string;
        metadata: {
          artists: Set<string>;
          publisher?: string;
          copyright?: string;
          narrator?: Set<string>;
        };
      }) {
        for (const artist of metadata.artists) {
          const book = yield* getAndProcessSearchResults({
            audible,
            searchParams: {
              title,
              author: artist,
            },
            filterParams: {
              title,
              artist,
              metadata,
            },
          });

          if (Option.isSome(book)) return Option.some(book.value);
        }

        return Option.none();
      },
      (effect, { title, metadata }) =>
        effect.pipe(
          Effect.annotateLogs({
            searchStrategy: 'Title + Author',
            title,
            metadata,
          })
        )
    ),
  },
  {
    name: 'Title',
    execute: Effect.fn(
      function* ({
        audible,
        title,
        metadata,
      }: {
        audible: Audible;
        title: string;
        metadata: {
          artists: Set<string>;
          publisher?: string;
          copyright?: string;
          narrator?: Set<string>;
        };
      }) {
        // Single result from title-only search is a decent match
        // TODO: Make sure to write a test for this
        const book = yield* getAndProcessSearchResults({
          audible,
          searchParams: { title },
          filterParams: { title, metadata },
        });

        if (Option.isSome(book)) return Option.some(book.value);

        // For title-only searches, we can still try to match with known artists
        for (const artist of metadata.artists) {
          const book = yield* getAndProcessSearchResults({
            audible,
            searchParams: { title },
            filterParams: { title, artist, metadata },
          });

          if (Option.isSome(book)) return Option.some(book.value);
        }

        return Option.none();
      },
      (effect, { title, metadata }) =>
        effect.pipe(
          Effect.annotateLogs({
            searchStrategy: 'Title',
            title,
            metadata,
          })
        )
    ),
  },
] as const;

export const matchAudiobook = (book: {
  normalizedTags: Record<string, string>;
  realPath: string | undefined;
  parentPath: string;
  name: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const audible = yield* Audible;

    const metadata = {
      asins: new Set(
        [
          book.normalizedTags['asin']?.trim(),
          book.normalizedTags['audible_asin']?.trim(),
          book.normalizedTags['isbn']?.trim(),
          ...path.join(book.parentPath, book.name).matchAll(asinRegex).toArray().flat(),
          ...(book.realPath ? book.realPath.matchAll(asinRegex).toArray().flat() : []),
        ].filter((i) => i !== undefined)
      ),
      titles: new Set(
        [book.normalizedTags['title']?.trim(), book.normalizedTags['album']?.trim()].filter(
          (i) => i !== undefined
        )
      ),
      artists: new Set(
        [
          ...parseMultiAuthorNarrator(book.normalizedTags['artist']),
          ...parseMultiAuthorNarrator(book.normalizedTags['album_artist']),
        ].filter((i) => i !== undefined)
      ),
      copyright: book.normalizedTags['copyright']?.trim(),
      publisher: book.normalizedTags['publisher']?.trim(),
      narrators: new Set(
        [
          ...parseMultiAuthorNarrator(book.normalizedTags['narrator']),
          ...parseMultiAuthorNarrator(book.normalizedTags['composer']),
        ].filter((i) => i !== undefined)
      ),
    };

    metadata.titles = new Set([
      ...metadata.titles,
      ...metadata.titles.values().map((i) => removeEnclosingContent(i)),
    ]);
    metadata.artists = new Set([
      ...metadata.artists,
      ...metadata.artists.values().map((i) => removeEnclosingContent(i)),
    ]);

    yield* Effect.logDebug('Attempting to find matches using ASIN metadata', metadata.asins);
    for (const asin of metadata.asins) {
      const product = yield* audible.getProductByAsin({ asin }).pipe(Effect.option);

      if (Option.isSome(product)) {
        if (Schema.is(ProductBookSchema)(product.value)) {
          yield* Effect.logDebug(`Matched as ${product.value.asin}`, product.value);
          return Option.some(product.value);
        } else {
          yield* Effect.logDebug(
            `Fetched product was not a valid book, continuing search`,
            product.value
          );
        }
      }
    }

    // Try search strategies in decreasing order of specificity
    for (const searchStrategy of searchStrategies) {
      for (const title of metadata.titles) {
        const searchResult = yield* searchStrategy.execute({
          audible,
          title,
          metadata,
        });

        if (Option.isSome(searchResult)) {
          return Option.some(searchResult.value);
        } else {
          yield* Effect.logDebug('No book found', {
            searchStrategy: searchStrategy.name,
          });
        }
      }
    }

    yield* Effect.logError('Book could not be identified, ignoring');
    return Option.none();
  });
