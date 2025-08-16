import { Effect } from 'effect';
import type { Insertable } from 'kysely';

import { Audible, ProductBookSchema } from '@/router/v1/library/audible';

import type { ContributorTable } from '@/libs/db/schema';

export const getContributors = (book: typeof ProductBookSchema.Type) =>
  Effect.gen(function* () {
    const audible = yield* Audible;

    const contributors: Pick<Insertable<ContributorTable>, 'asin' | 'name' | 'about' | 'avatar'>[] =
      [];

    for (const contributor of book.contributors) {
      const contributorAsin = contributor.asin; // for type-safety
      if (!contributorAsin) continue;

      contributors.push(
        yield* audible
          .getAuthorByAsin({
            asin: contributorAsin,
          })
          .pipe(
            Effect.tapError(() =>
              Effect.logWarning(
                'Failed to fetch author details, falling back to author info from book',
                {
                  bookAsin: book.asin,
                  author: contributor,
                }
              )
            ),
            Effect.catchAll(() => Effect.succeed({ asin: contributorAsin, name: contributor.name }))
          )
      );
    }

    return contributors;
  });
