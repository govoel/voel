import { Turndown } from './turndown';
import { FetchHttpClient } from '@effect/platform';
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
        createProgram('B0FLYHTBS3').pipe(
          Effect.provide(
            Audible.DefaultWithoutDependencies.pipe(
              Layer.provide(
                Layer.mergeAll(
                  Turndown.Default,
                  FetchHttpClient.layer.pipe(
                    Layer.provide(
                      Layer.succeed(FetchHttpClient.Fetch, (() =>
                        Promise.resolve(
                          new Response(
                            JSON.stringify(
                              // prettier-ignore
                              {"product":{"asin":"B0FLYHTBS3","asset_details":[],"authors":[{"name":"Anna Thomasson"}],"category_ladders":[{"ladder":[{"id":"18571951011","name":"Biographies & Memoirs"},{"id":"18571953011","name":"Art & Literature"},{"id":"18571954011","name":"Artists, Architects & Photographers"}],"root":"Genres"},{"ladder":[{"id":"18573518011","name":"History"},{"id":"18573695011","name":"World"}],"root":"Genres"}],"content_delivery_type":"SinglePartBook","content_type":"Product","copyright":"©2026 Anna Thomasson (P)2026 Macmillan Publishers International Limited","date_first_available":"2026-03-26","extended_product_description":"<p>In A Vast Horizon, biographer Anna Thomasson tells the story of their creativity, friendships and pursuit of freedom set against the tense political backdrop of the 1930s, the Second World War and its aftermath. Tracing their lives through their photographs, artworks, poems and letters, from the heady weeks of creativity, sex and collaboration of that Mediterranean summer through the tumultuous years that followed, it is the story of rebellious lives and the redemptive power of art.</p>","format_type":"unabridged","has_children":false,"is_adult_product":false,"is_listenable":true,"is_pdf_url_available":false,"is_purchasability_suppressed":false,"is_vvab":false,"isbn":"9781035092291","issue_date":"2026-03-26","language":"english","merchandising_description":"","merchandising_summary":"<p>In A Vast Horizon, biographer Anna Thomasson tells the story of their creativity, friendships and pursuit of freedom set against the tense political backdrop of the 1930s, the Second World War and its aftermath.</p>","platinum_keywords":["Biographies_Memoirs/Artists,_Authors_Musicians/Authors","Biographies_Memoirs","Biographies_Memoirs/Artists,_Authors_Musicians/Photographers","Classics"],"product_site_launch_date":"2025-08-11T13:06:00Z","publication_datetime":"2026-03-26T07:00:00Z","publisher_name":"Picador","publisher_summary":"<p><b>Late summer 1937. Europe is inching towards war. In the South of France a group of friends picnic in a secluded clearing. The women have peeled down their dresses to their waists. A couple kiss playfully while the others look on, laughing. The moment is captured in a now-iconic image by photographer Lee Miller.</b></p> <p>Some of the friends are well known, others less so: the dancer Ady Fidelin, the poet Paul Éluard and his wife Nusch, the Surrealists Man Ray and Roland Penrose. They are spending the summer with fellow artists Dora Maar, Eileen Agar and Pablo Picasso.</p> <p>In <i>A Vast Horizon</i>, biographer Anna Thomasson tells the story of their creativity, friendships and pursuit of freedom set against the tense political backdrop of the 1930s, the Second World War and its aftermath. Tracing their lives through their photographs, artworks, poems and letters, from the heady weeks of creativity, sex and collaboration of that Mediterranean summer through the tumultuous years that followed, it is the story of rebellious lives and the redemptive power of art.</p>","read_along_support":"false","release_date":"2026-03-26","runtime_length_min":600,"sku":"BK_MACM_003765","sku_lite":"BK_MACM_003765","social_media_images":{"facebook":"https://m.media-amazon.com/images/I/51fzq01vAwL._SL10_UR1600,800_CR200,50,1200,630_CLa%7C1200,630%7C51fzq01vAwL.jpg%7C0,0,1200,630+82,82,465,465_PJAdblSocialShare-Gradientoverlay-largeasin-0to70,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Large,TopLeft,600,270_OU01_ZBLISTENING%20ON,617,216,52,500,AudibleSansMd,30,255,255,255.jpg","ig_bg":"https://m.media-amazon.com/images/I/51fzq01vAwL._SL200_BL80_UR1080,2160.jpg","ig_static_with_bg":"https://m.media-amazon.com/images/I/51fzq01vAwL._SL200_BL80_UR1080,2160_CLa%7C1080,2160%7C51fzq01vAwL.jpg%7C0,0,1080,2160+288,614,500,500_PJAdblSocialShare-Gradientoverlay-Radial,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Small,TopLeft,290,461_ZBLISTENING%20ON,290,410,52,500,AudibleSansMd,34,255,255,255_ZBA%20Vast%20Horizon,290,1183,52,500,AudibleSansSm,32,255,255,255_ZBAnna%20Thomasson,290,1247,52,500,AudibleSansRg,28,255,255,255.jpg","ig_sticker":"https://m.media-amazon.com/images/I/71UyRin7-TL._CLa%7C614,913%7C51fzq01vAwL.jpg%7C0,0,614,913+70,79,471,473_FMpng_PJAudible-logo-dk,BottomLeft,70,-100_ZAA%20Vast%20Horizon,70,560,65,500,AudibleSansSm,42,54,54,54_ZAby%20Anna%20Thomasson,70,640,52,517,AudibleSansRg,32,0,0,0.png","twitter":"https://m.media-amazon.com/images/I/51fzq01vAwL._SL10_UR1600,800_CR200,50,1024,512_CLa%7C1024,512%7C51fzq01vAwL.jpg%7C0,0,1024,512+67,67,376,376_PJAdblSocialShare-Gradientoverlay-twitter-largeasin-0to60,TopLeft,0,0_PJAdblSocialShare-AudibleLogo-Medium,TopLeft,490,223_OU01_ZBLISTENING%20ON,483,152,55,450,AudibleSansMd,32,255,255,255.jpg"},"subtitle":"Artists and Lovers, Freedom and War","title":"A Vast Horizon"},"response_groups":["relationships","product_desc","always-returned","product_extended_attrs","contributors","series","media","category_ladders","product_attrs","product_details"]}
                            ),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                          )
                        )) as unknown as typeof fetch)
                    )
                  )
                )
              )
            )
          )
        )
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
