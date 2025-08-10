import { Audible, ProductBookSchema } from '../audible';
import { Effect, Option } from 'effect';
import type { Insertable } from 'kysely';

import type { AuthorTable, BookContributorTable } from '@/libs/db/schema';

export const getAuthorsAndContributors = (book: typeof ProductBookSchema.Type) =>
  Effect.gen(function* () {
    const audible = yield* Audible;

    const authors: Pick<Insertable<AuthorTable>, 'asin' | 'name' | 'about' | 'avatar'>[] = [];
    const contributors: Pick<Insertable<BookContributorTable>, 'name' | 'role'>[] = [];

    for (const author of book.authors) {
      if (author.name.endsWith(' - edited by')) {
        contributors.push({
          role: 'editor',
          name: author.name.substring(0, author.name.length - 12),
        });
      } else if (author.name.endsWith(' - translated by')) {
        contributors.push({
          role: 'translator',
          name: author.name.substring(0, author.name.length - 16),
        });
      } else if (author.name.endsWith(' - translator')) {
        contributors.push({
          role: 'translator',
          name: author.name.substring(0, author.name.length - 13),
        });
      } else if (typeof author.asin === 'string') {
        const authorAsin = author.asin; // for type-safety
        authors.push(
          yield* audible
            .getAuthorByAsin({
              asin: authorAsin,
            })
            .pipe(
              Effect.tapError(() =>
                Effect.logWarning(
                  'Failed to fetch author details, falling back to author info from book',
                  {
                    bookAsin: book.asin,
                    author,
                  }
                )
              ),
              Effect.catchAll(() => Effect.succeed({ asin: authorAsin, name: author.name }))
            )
        );
      } else {
        yield* Effect.logError('Unknown contributor type, ignoring book', {
          bookAsin: book.asin,
          contributor: author,
        });

        return Option.none();
      }
    }

    if (authors.length === 0) {
      yield* Effect.logError('No authors found, ignoring book', {
        bookAsin: book.asin,
      });

      return Option.none();
    }

    return Option.some({
      authors,
      contributors,
    });
  });
