import { type Product, getProductByAsin, getProductsBySearch } from '@/router/v1/library/audible';
import type { AudioFile } from '@/router/v1/library/scanner';

import { scanLogger } from '@/logger';

const matchers = {
  title: (product: Product, title: string) => {
    return (
      typeof product.title === 'string' &&
      product.title.trim().toLowerCase() === title.toLowerCase()
    );
  },

  artist: (product: Product, artist: string) => {
    return (
      Array.isArray(product.authors) &&
      product.authors.some((author) => author.name.trim().toLowerCase() === artist.toLowerCase())
    );
  },

  publisher: (product: Product, publisher?: string) => {
    return (
      typeof publisher === 'string' &&
      typeof product.publisher_name === 'string' &&
      product.publisher_name.trim().toLowerCase() === publisher.toLowerCase()
    );
  },

  copyright: (product: Product, copyright?: string) => {
    return (
      typeof copyright === 'string' &&
      typeof product.copyright === 'string' &&
      product.copyright.trim().toLowerCase() === copyright.toLowerCase()
    );
  },

  narrators: (product: Product, narrators?: Set<string>) => {
    return (
      narrators instanceof Set &&
      Array.isArray(product.narrators) &&
      product.narrators.some((n) => {
        for (const name of narrators) {
          if (n.name.trim().toLowerCase() === name.toLowerCase()) {
            return true;
          }
        }
        return false;
      })
    );
  },
};

const filterStrategies = [
  {
    name: 'title+author+publisher+copyright+narrator',
    apply: (
      product: Product,
      title: string,
      artist: string,
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) =>
      matchers.title(product, title) &&
      matchers.artist(product, artist) &&
      matchers.publisher(product, metadata.publisher) &&
      matchers.copyright(product, metadata.copyright) &&
      matchers.narrators(product, metadata.narrator),
  },
  {
    name: 'title+author+publisher+copyright',
    apply: (
      product: Product,
      title: string,
      artist: string,
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) =>
      matchers.title(product, title) &&
      matchers.artist(product, artist) &&
      matchers.publisher(product, metadata.publisher) &&
      matchers.copyright(product, metadata.copyright),
  },
  {
    name: 'title+author+publisher+narrator',
    apply: (
      product: Product,
      title: string,
      artist: string,
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) =>
      matchers.title(product, title) &&
      matchers.artist(product, artist) &&
      matchers.publisher(product, metadata.publisher) &&
      matchers.narrators(product, metadata.narrator),
  },
  {
    name: 'title+author+copyright+narrator',
    apply: (
      product: Product,
      title: string,
      artist: string,
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) =>
      matchers.title(product, title) &&
      matchers.artist(product, artist) &&
      matchers.copyright(product, metadata.copyright) &&
      matchers.narrators(product, metadata.narrator),
  },
  {
    name: 'title+author+publisher',
    apply: (
      product: Product,
      title: string,
      artist: string,
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) =>
      matchers.title(product, title) &&
      matchers.artist(product, artist) &&
      matchers.publisher(product, metadata.publisher),
  },
  {
    name: 'title+author+copyright',
    apply: (
      product: Product,
      title: string,
      artist: string,
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) =>
      matchers.title(product, title) &&
      matchers.artist(product, artist) &&
      matchers.copyright(product, metadata.copyright),
  },
  {
    name: 'title+author+narrator',
    apply: (
      product: Product,
      title: string,
      artist: string,
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) =>
      matchers.title(product, title) &&
      matchers.artist(product, artist) &&
      matchers.narrators(product, metadata.narrator),
  },
  {
    name: 'title+author',
    apply: (
      product: Product,
      title: string,
      artist: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      metadata: { publisher?: string; copyright?: string; narrator?: Set<string> }
    ) => matchers.title(product, title) && matchers.artist(product, artist),
  },
] as const;

const searchStrategies = [
  {
    name: 'Title + Author + Publisher',
    requiresArtist: true,
    execute: async (title: string, artist: string, publisher?: string) => {
      if (!publisher) return null;
      return getProductsBySearch({ title, author: artist, publisher });
    },
  },
  {
    name: 'Title + Author',
    requiresArtist: true,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execute: async (title: string, artist: string, publisher?: string) => {
      return getProductsBySearch({ title, author: artist });
    },
  },
  {
    name: 'Title',
    requiresArtist: false,
    execute: async (title: string) => {
      return getProductsBySearch({ title });
    },
  },
] as const;

const processSearchResults = async (
  products: Product[],
  title: string,
  artist: string,
  metadata: { publisher?: string; copyright?: string; narrator?: Set<string> },
  searchStrategyName: string
) => {
  if (products.length === 1 && products[0]?.asin) {
    const product = await getProductByAsin(products[0].asin);
    if (product) {
      scanLogger.debug(
        "[Match] %s: Found single match for '%s' => %s",
        searchStrategyName,
        title,
        product.asin
      );
      return product;
    }
  }

  for (const filterStrategy of filterStrategies) {
    const filteredProducts = products.filter((product) =>
      filterStrategy.apply(product, title, artist, metadata)
    );

    if (filteredProducts.length === 1 && filteredProducts[0]?.asin) {
      const product = await getProductByAsin(filteredProducts[0].asin);
      if (product) {
        scanLogger.debug(
          "[Match] %s with '%s' filter: Found match for '%s' => %s",
          searchStrategyName,
          title,
          filterStrategy.name,
          product.asin
        );
        return product;
      }
    } else if (filteredProducts.length > 1) {
      scanLogger.debug(
        "[Match] %s with '%s' filter: Found multiple matches (%d) for '%s'",
        searchStrategyName,
        filterStrategy.name,
        filteredProducts.length,
        title
      );
    }
  }

  scanLogger.debug(
    "[Match] %s: No definitive match found for '%s' by '%s'",
    searchStrategyName,
    title,
    artist
  );
  return null;
};

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

const asinRegex = /(B[\dA-Z]{9}|\d{9}(X|\d))/g;

// get title+author+publisher results from audible
// local filters
//
// get title+author results from audible
// local filters
//
// get title results from audible
// local filters
//
// getting results from audible is reversed because we want to prioritize the most specific results
//
// local filters order:
// 1. title+author+publisher+copyright+narrator
// 2. title+author+publisher+copyright
// 3. title+author+publisher+narrator
// 4. title+author+copyright+narrator
// 5. title+author+publisher
// 6. title+author+copyright
// 7. title+author+narrator
// 8. title+author
export const matchAlbumGroup = async (albumGroup: AudioFile) => {
  scanLogger.debug('[Match] Starting search for album in file: "%s"', albumGroup.path);
  const tags = albumGroup.metadata.format.tags;

  const metadata = {
    asins: new Set(
      [
        tags['asin']?.trim(),
        tags['audible_asin']?.trim(),
        tags['isbn']?.trim(),
        ...albumGroup.path.matchAll(asinRegex).toArray().flat(),
        ...albumGroup.realPath.matchAll(asinRegex).toArray().flat(),
      ].filter((i) => i !== undefined)
    ),
    titles: new Set([tags['title']?.trim(), tags['album']?.trim()].filter((i) => i !== undefined)),
    artists: new Set(
      [
        ...parseMultiAuthorNarrator(tags['artist']),
        ...parseMultiAuthorNarrator(tags['album_artist']),
      ].filter((i) => i !== undefined)
    ),
    copyright: tags['copyright']?.trim(),
    publisher: tags['publisher']?.trim(),
    narrators: new Set(
      [
        ...parseMultiAuthorNarrator(tags['narrator']),
        ...parseMultiAuthorNarrator(tags['composer']),
      ].filter((i) => i !== undefined)
    ),
  };

  scanLogger.debug({
    msg: '[Match] Metadata extracted',
    metadata: {
      asins: Array.from(metadata.asins),
      titles: Array.from(metadata.titles),
      artists: Array.from(metadata.artists),
      copyright: metadata.copyright,
      publisher: metadata.publisher,
      narrators: Array.from(metadata.narrators),
    },
  });

  // First attempt: ASIN direct lookup
  for (const asin of metadata.asins) {
    try {
      scanLogger.debug('[Match] Attempting direct ASIN lookup for %s', asin);
      const product = await getProductByAsin(asin);

      if (product) {
        scanLogger.debug('[Match] Found direct ASIN match: %s', product.asin);
        return product;
      }
    } catch (error) {
      scanLogger.error('[Match] ASIN lookup failed for %s: %s', asin, error);
    }
  }

  // Try search strategies in decreasing order of specificity
  for (const searchStrategy of searchStrategies) {
    scanLogger.debug('[Match] Trying %s search strategy', searchStrategy.name);

    // For strategies requiring an artist, try all title-artist combinations
    if (searchStrategy.requiresArtist) {
      for (const title of metadata.titles) {
        for (const artist of metadata.artists) {
          try {
            scanLogger.debug(
              '[Match] Searching with %s strategy: title="%s", artist="%s", publisher="%s"',
              searchStrategy.name,
              title,
              artist,
              metadata.publisher || 'Unknown'
            );

            const products = await searchStrategy.execute(title, artist, metadata.publisher);
            if (!products || products.length === 0) {
              scanLogger.debug(
                '[Match] %s search returned no results for: title="%s", artist="%s", publisher="%s"',
                searchStrategy.name,
                title,
                artist,
                metadata.publisher || 'Unknown'
              );
              continue;
            }

            scanLogger.debug(
              '[Match] %s search returned %d results for: title="%s", artist="%s", publisher="%s"',
              searchStrategy.name,
              products.length,
              title,
              artist,
              metadata.publisher || 'Unknown'
            );

            const match = await processSearchResults(
              products,
              title,
              artist,
              metadata,
              searchStrategy.name
            );
            if (match) return match;
          } catch (error) {
            scanLogger.error(
              '[Match] %s search error for: title="%s", artist="%s", publisher="%s": %o',
              searchStrategy.name,
              title,
              artist,
              metadata.publisher || 'Unknown',
              error
            );
          }
        }
      }
    }
    // For strategies that don't require an artist (title-only)
    else {
      for (const title of metadata.titles) {
        try {
          scanLogger.debug(
            '[Match] Searching with %s strategy: title="%s"',
            searchStrategy.name,
            title
          );

          const products = await searchStrategy.execute(title);

          if (!products || products.length === 0) {
            scanLogger.debug(
              '[Match] %s search returned no results for "%s"',
              searchStrategy.name,
              title
            );
            continue;
          }

          scanLogger.debug(
            '[Match] %s search returned %d results for: title="%s"',
            searchStrategy.name,
            products.length,
            title
          );

          // Single result from title-only search is a decent match
          if (products.length === 1 && products[0]?.asin) {
            const product = await getProductByAsin(products[0].asin);
            if (product) {
              scanLogger.debug(
                '[Match] %s: Found single match for: title="%s" => %s',
                searchStrategy.name,
                product.title,
                product.asin
              );
              return product;
            }
          }

          // For title-only searches, we can still try to match with known artists
          for (const artist of metadata.artists) {
            const match = await processSearchResults(
              products,
              title,
              artist,
              metadata,
              `${searchStrategy.name} with artist filter`
            );
            if (match) return match;
          }
        } catch (error) {
          scanLogger.error(
            '[Match] %s search error for "%s": %o',
            searchStrategy.name,
            title,
            error
          );
        }
      }
    }
  }

  scanLogger.warn('[Match] No match found for album in: "%s"', albumGroup.path);
  return null;
};
