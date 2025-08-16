import { Effect, Option, Schema } from 'effect';
import type { Insertable } from 'kysely';

import { Audible, type ProductBookSchema, ProductSeriesSchema } from '@/router/v1/library/audible';
import { ProductBookRelationshipSeriesSchema } from '@/router/v1/library/audible/getProductByAsin';

import type { BookSeriesTable, SeriesTable } from '@/libs/db/schema';

export const getSeries = (book: typeof ProductBookSchema.Type) =>
  Effect.gen(function* () {
    const seriesArr: (Insertable<SeriesTable> &
      Pick<Insertable<BookSeriesTable>, 'label' | 'sort'>)[] = [];

    if (book.series) {
      const audible = yield* Audible;

      const sourceSeriesFromBook: { asin: string; summary: string | undefined }[] = [];

      for (const series of book.series) {
        const seriesFromAudible = yield* audible
          .getProductByAsin({
            asin: series.asin,
          })
          .pipe(Effect.option);

        if (Option.isNone(seriesFromAudible)) {
          yield* Effect.logError('Could not fetch series, falling back to data from book', {
            bookAsin: book.asin,
            series,
          });
          sourceSeriesFromBook.push({ asin: series.asin, summary: undefined });
        } else if (!Schema.is(ProductSeriesSchema)(seriesFromAudible.value)) {
          yield* Effect.logError(
            'Fetched product was not a series, falling back to data from book',
            {
              bookAsin: book.asin,
              series,
            }
          );
          sourceSeriesFromBook.push({
            asin: series.asin,
            summary: undefined,
          });
        } else {
          const seriesRelationship = seriesFromAudible.value.relationships.find(
            (r) => r.asin === book.asin
          );

          if (!seriesRelationship) {
            yield* Effect.logError(
              'No relationship to book found in series, falling back to data from book',
              {
                bookAsin: book.asin,
                seriesAsin: seriesFromAudible.value.asin,
              }
            );
            sourceSeriesFromBook.push({
              asin: series.asin,
              summary: seriesFromAudible.value.publisher_summary_md,
            });
          } else {
            seriesArr.push({
              asin: seriesFromAudible.value.asin,
              name: seriesFromAudible.value.title,
              summary: seriesFromAudible.value.publisher_summary_md,
              label: seriesRelationship.sequence,
              sort: seriesRelationship.sort,
            });
          }
        }

        if (sourceSeriesFromBook.length > 0) {
          if (!book.relationships || book.relationships.length === 0) {
            yield* Effect.logError('No relationships to any series found in book, ignoring book', {
              bookAsin: book.asin,
            });
            return Option.none();
          }

          for (const series of sourceSeriesFromBook) {
            const fallbackSeriesRelationship = book.relationships.find(
              (r) => r.asin === series.asin && r.relationship_type === 'series'
            ) as typeof ProductBookRelationshipSeriesSchema.Type; // i don't know why the `as` is necessary... i tried lots of things, and nothing narrowed correctly

            if (!fallbackSeriesRelationship) {
              yield* Effect.logError('No relationship to series found in book, ignoring book', {
                bookAsin: book.asin,
                seriesAsin: series.asin,
              });
              return Option.none();
            }

            seriesArr.push({
              asin: series.asin,
              name: fallbackSeriesRelationship.title,
              summary: series.summary,
              label: fallbackSeriesRelationship.sequence,
              sort: fallbackSeriesRelationship.sort,
            });
          }
        }
      }
    }

    return Option.some(seriesArr);
  });
