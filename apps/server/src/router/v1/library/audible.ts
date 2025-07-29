import axios from 'axios';
import * as z from 'zod';

import { scanLogger } from '@/logger';

const audible = axios.create({
  baseURL: 'https://api.audible.com/1.0',
});

const bookSchema = z.object({
  content_delivery_type: z.enum(['MultiPartBook', 'SinglePartBook', 'Bundle']),

  asin: z.string(),
  format_type: z.union([z.literal('abridged'), z.literal('unabridged')]),
  is_adult_product: z.boolean(),

  authors: z.array(z.object({ asin: z.string().optional(), name: z.string() })),
  narrators: z.array(z.object({ name: z.string() })),
  series: z
    .array(z.object({ asin: z.string(), title: z.string(), sequence: z.string(), url: z.string() }))
    .optional(),

  title: z.string().trim(),
  subtitle: z.string().optional(),
  copyright: z.string(),
  publisher_name: z.string(),
  product_images: z.object({
    '500': z.string(),
  }),

  extended_product_description: z.string(),
  merchandising_summary: z.string(),
  publisher_summary: z.string(),
});

export type AudibleBook = z.infer<typeof bookSchema>;

const seriesSchema = z.object({
  content_delivery_type: z.literal('BookSeries'),

  asin: z.string(),

  authors: z.array(
    z.object({
      // not all series provide an asin here
      // asin: z.string(),
      name: z.string().trim(),
    })
  ),
  relationships: z.array(
    z.object({
      asin: z.string(),
      relationship_type: z.literal('series'),
      relationship_to_product: z.literal('child'),
      sequence: z.string(),
      sort: z.coerce.number(),
    })
  ),

  title: z.string().trim(),

  // not all series provide a summary
  publisher_summary: z.string().optional(),
});

export type AudibleSeries = z.infer<typeof seriesSchema>;

const asinResponse = z.object({
  product: z.discriminatedUnion('content_delivery_type', [bookSchema, seriesSchema]),
});

export const getProductByAsin = async (asin: string) => {
  try {
    scanLogger.debug('[ASIN:%s] Fetching product details from Audible API', asin);
    const response = await asinResponse.safeParseAsync(
      (
        await audible.get(`/catalog/products/${asin}`, {
          params: {
            response_groups:
              'contributors,media,product_attrs,product_desc,product_details,product_extended_attrs,series,relationships,category_ladders',
          },
        })
      ).data
    );

    if (response.error) {
      scanLogger.error(
        '[ASIN:%s] Retrieved incomplete product, validation failed: %o',
        asin,
        response.error
      );
      return null;
    }

    scanLogger.debug('[ASIN:%s] Successfully retrieved full product', asin);
    return response.data.product;
  } catch (error) {
    scanLogger.error('[ASIN:%s] Failed to fetch product: %s', asin, error);
    return null;
  }
};

export const isProductSeries = (
  product: z.infer<typeof asinResponse>['product']
): product is AudibleSeries => product.content_delivery_type === 'BookSeries';

export const isProductBook = (
  product: z.infer<typeof asinResponse>['product']
): product is AudibleBook => !isProductSeries(product);

const bookSearchSchema = bookSchema.pick({
  asin: true,
  authors: true,
  narrators: true,
  title: true,
  subtitle: true,
  copyright: true,
  publisher_name: true,
  extended_product_description: true,
});

export type AudibleBookSearchResult = z.infer<typeof bookSearchSchema>;

const productSearchResponse = z.object({
  products: z.array(bookSearchSchema),
});

export const getProductsBySearch = async (params: {
  author?: string;
  title: string;
  publisher?: string;
}) => {
  try {
    scanLogger.debug('[Search] Querying Audible API with query params: %o', params);
    const response = await productSearchResponse.safeParseAsync(
      (
        await audible.get('/catalog/products', {
          params: {
            response_groups: 'contributors,product_desc,product_details',
            num_results: 50,
            page: 0,
            ...params,
          },
        })
      ).data
    );

    if (response.error) {
      scanLogger.debug(
        '[Search] Retrieved incomplete product, validation failed for query params %o: %o',
        params,
        z.treeifyError(response.error)
      );
      return null;
    }

    const productCount = response.data.products.length;
    scanLogger.debug('[Search] Found %d products for query params: %o', productCount, params);
    return response.data.products;
  } catch (error) {
    scanLogger.error('[Search] Query failed for query params %o: %s', params, error);
    return null;
  }
};

const leafChapterSchema = z.object({
  length_ms: z.number(),
  start_offset_ms: z.number(),
  start_offset_sec: z.number(),
  title: z.string().trim(),
});

type LeafChapterSchema = z.infer<typeof leafChapterSchema>;

const parentChapterSchema = z.object({
  length_ms: z.number(),
  start_offset_ms: z.number(),
  start_offset_sec: z.number(),
  title: z.string().trim(),
  get chapters() {
    return z.array(z.union([parentChapterSchema, leafChapterSchema])).optional();
  },
});

type ParentChapterSchema = z.infer<typeof parentChapterSchema>;

const chapterSchema = z.union([parentChapterSchema, leafChapterSchema]);

const chapterResponse = z.object({
  content_metadata: z.object({
    chapter_info: z.object({
      brandIntroDurationMs: z.number(),
      brandOutroDurationMs: z.number(),
      chapters: z.array(chapterSchema),
      is_accurate: z.boolean(),
      runtime_length_ms: z.number(),
      runtime_length_sec: z.number(),
    }),
  }),
});

export type AudibleChapters = z.infer<typeof chapterResponse>['content_metadata']['chapter_info'];

export const isParentChapter = (
  chapter: ParentChapterSchema | LeafChapterSchema
): chapter is Required<ParentChapterSchema> => {
  return 'chapters' in chapter && Array.isArray(chapter.chapters);
};

export const getChapterByAsin = async (asin: string) => {
  try {
    scanLogger.debug('[Chapter] Querying Audible API with ASIN: %s', asin);
    const response = await chapterResponse.safeParseAsync(
      (
        await audible.get(`/content/${asin}/metadata`, {
          params: {
            response_groups: 'chapter_info',
            chapter_titles_type: 'Tree',
          },
        })
      ).data
    );

    if (response.error) {
      scanLogger.debug(
        '[ASIN:%s] Retrieved incomplete chapter info, validation failed: %o',
        asin,
        z.treeifyError(response.error)
      );
      return null;
    }

    scanLogger.debug('[ASIN:%s] Successfully retrieved full chapter info', asin);
    return response.data.content_metadata.chapter_info;
  } catch (error) {
    scanLogger.error('[ASIN:%s] Failed to fetch chapter info: %s', asin, error);
    return null;
  }
};

const authorResponse = z.object({
  asin: z.string(),
  name: z.string().trim(),
  avatar: z.string(),
  about: z.string().nullable(),
});

export type AudibleAuthor = z.infer<typeof authorResponse>;

export const getAuthorByAsin = async (asin: string) => {
  try {
    scanLogger.debug('[Author] Querying Audible API with ASIN: %s', asin);
    const response = await audible.get(`/screens/audible-android-author-detail/${asin}`, {
      headers: { 'x-adp-sw': 0 },
      params: { author_asin: asin, title_source: 'all' },
    });

    if (!('sections' in response.data && Array.isArray(response.data.sections))) {
      scanLogger.debug(
        '[Author] Retrieved incomplete author info for ASIN %s, validation failed: sections is not an array',
        asin
      );
      return null;
    }

    const potentialAuthor = {
      asin,
      name: null,
      avatar: null,
      about: null,
    };

    for (const section of response.data.sections) {
      if ('model' in section) {
        if (
          'name' in section.model &&
          'profile_image' in section.model &&
          typeof section.model.name.value === 'string' &&
          (typeof section.model.profile_image.url === 'string' ||
            typeof section.model.profile_image.lazy_load_url === 'string')
        ) {
          potentialAuthor.name = section.model.name.value;
          if (typeof section.model.profile_image.url === 'string') {
            potentialAuthor.avatar = section.model.profile_image.url;
          } else if (typeof section.model.profile_image.lazy_load_url === 'string') {
            potentialAuthor.avatar = section.model.profile_image.lazy_load_url;
          }
        } else if ('items' in section.model && Array.isArray(section.model.items)) {
          for (const item of section.model.items) {
            if (
              'model' in item &&
              'expandable_content' in item.model &&
              typeof item.model.expandable_content.value === 'string'
            ) {
              potentialAuthor.about = item.model.expandable_content.value;
              break;
            }
          }
        }
      }
    }

    const author = await authorResponse.safeParseAsync(potentialAuthor);
    if (!author.success) {
      scanLogger.error(
        '[Author] Failed to parse author info for ASIN %s: %o',
        asin,
        z.treeifyError(author.error)
      );
      return null;
    }

    scanLogger.debug('[Author] Successfully retrieved full author info for ASIN: %s', asin);
    return author.data;
  } catch (error) {
    scanLogger.error('[Author] Failed to fetch author info for ASIN %s: %s', asin, error);
    return null;
  }
};
