import { Effect, Option } from 'effect';
import type { Insertable } from 'kysely';

import { Audible, type ProductBookSchema } from '@/router/v1/library/audible';

import type { BookSeriesTable, SeriesTable } from '@/libs/db/schema';

export const getSeries = (book: typeof ProductBookSchema.Type) =>
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
