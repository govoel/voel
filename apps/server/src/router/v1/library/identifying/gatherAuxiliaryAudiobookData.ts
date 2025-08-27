import { Effect, Option } from 'effect';
import type { Insertable } from 'kysely';

import { Audible, type ProductBookSchema } from '@/router/v1/library/audible';

import type { BookSeriesTable, ContributorTable, SeriesTable } from '@/libs/db/schema';

const getSeries = (book: typeof ProductBookSchema.Type) =>
  Effect.gen(function* () {
    const seriesArr: {
      series: Insertable<SeriesTable>;
      bookSeries: Pick<Insertable<BookSeriesTable>, 'title' | 'label' | 'sort'>;
    }[] = [];

    if (book.relationships) {
      for (const relationship of book.relationships) {
        if (relationship.relationship_type === 'series') {
          seriesArr.push({
            series: { asin: relationship.asin, name: relationship.title, summary: null },
            bookSeries: {
              title: relationship.title,
              label: relationship.sequence,
              sort: relationship.sort,
            },
          });
        }
      }
    }

    const audible = yield* Audible;
    for (const { series, bookSeries } of seriesArr) {
      const seriesFromAudible = yield* audible
        .getProductByAsin({ asin: series.asin })
        .pipe(Effect.option);

      if (Option.isSome(seriesFromAudible)) {
        series.summary = seriesFromAudible.value.publisher_summary_md;
        bookSeries.title = seriesFromAudible.value.title;
      } else {
        yield* Effect.logWarning("Couldn't fetch series from Audible, using data from book").pipe(
          Effect.annotateLogs('seriesAsin', series.asin)
        );
      }
    }

    return seriesArr;
  }).pipe(Effect.annotateLogs('bookAsin', book.asin));

const getContributors = (book: typeof ProductBookSchema.Type) =>
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
                'Failed to fetch author details, falling back to author info from book'
              ).pipe(
                Effect.annotateLogs({
                  bookAsin: book.asin,
                  contributorAsin: contributor.asin,
                  contributorName: contributor.name,
                  contributorRole: contributor.role,
                })
              )
            ),
            Effect.catchAll(() => Effect.succeed({ asin: contributorAsin, name: contributor.name }))
          )
      );
    }

    return contributors;
  });

export const gatherAuxiliaryAudiobookData = (book: typeof ProductBookSchema.Type) => {
  return Effect.gen(function* () {
    const audible = yield* Audible;

    const contributors = yield* getContributors(book);

    const seriesArr = yield* getSeries(book);

    const chapters = yield* audible.getChaptersByAsin({ asin: book.asin }).pipe(
      Effect.tapError(() =>
        Effect.logWarning('Failed to fetch chapters for book, ignoring book').pipe(
          Effect.annotateLogs({
            bookAsin: book.asin,
          })
        )
      ),
      Effect.catchAll(() => Effect.succeed({ chapters: [] }))
    );

    const bookCoverThumbhash = book.product_images
      ? yield* audible
          .generateThumbhash({
            imageURL: book.product_images[500].replace(/\._S[A-Z]+500_\./, '._SL100_.'),
          })
          .pipe(
            Effect.tapError(() =>
              Effect.logWarning('Failed to generate thumbhash for book cover').pipe(
                Effect.annotateLogs({
                  bookAsin: book.asin,
                })
              )
            ),
            Effect.option
          )
      : Option.none();

    const contributorAvatarThumbhashes = yield* Effect.forEach(contributors, (contributor) =>
      contributor.avatar
        ? audible
            .generateThumbhash({
              imageURL: contributor.avatar.replace(/\._S[A-Z]+500_\./, '._SL100_.'),
            })
            .pipe(
              Effect.tapError(() =>
                Effect.logWarning('Failed to generate thumbhash for contributor avatar').pipe(
                  Effect.annotateLogs({
                    bookAsin: book.asin,
                    contributorAsin: contributor.asin,
                  })
                )
              ),
              Effect.option
            )
        : Effect.succeed(Option.none())
    );

    return {
      book: {
        asin: book.asin,
        type: 'audio' as const,
        title: book.title,
        subtitle: book.subtitle,
        cover: book.product_images?.[500] ?? null,
        coverThumbhash: Option.isSome(bookCoverThumbhash) ? bookCoverThumbhash.value : null,
        summary: book.publisher_summary_md,
        adultsOnly: book.is_adult_product ? (1 as const) : (0 as const),
      },

      bookContributors: book.contributors,

      contributors: contributors.map((contributor, i) => ({
        ...contributor,
        avatarThumbhash: Option.isSome(contributorAvatarThumbhashes[i]!)
          ? contributorAvatarThumbhashes[i].value
          : null,
      })),

      series: seriesArr,

      chapters: chapters.chapters,
    };
  });
};
