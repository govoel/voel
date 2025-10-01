import { describe, expect, test } from 'bun:test';
import { Effect, Layer, LogLevel, Logger } from 'effect';

import { Audible } from '@/router/v1/library/audible';

const createProgram = (asin: string) =>
  Effect.gen(function* () {
    const audible = yield* Audible;
    return yield* audible.getAuthorByAsin({ asin });
  });

const layer = Layer.merge(Logger.minimumLogLevel(LogLevel.None), Audible.Default);

describe.concurrent('regular author', async () => {
  test('with about and avatar', async () => {
    const result = await Effect.runPromise(createProgram('B019ZTQ5IM').pipe(Effect.provide(layer)));

    expect(result).toEqual(
      // prettier-ignore
      {asin:"B019ZTQ5IM",name:"Kel Kade",avatar:"https://images-na.ssl-images-amazon.com/images/S/amzn-author-media-prod/m1i92povi7s0bu0v8bs2mccfm0._SX500_.jpg",about:"Kel Kade lives in Texas and occasionally serves as an adjunct college faculty member, inspiring young minds and introducing them to the fascinating and very real world of geosciences. Thanks to Kade’s enthusiastic readers and the success of the King’s Dark Tidings series, Kade is now able to create universes spanning space and time, develop criminal empires, plot the downfall of tyrannous rulers, and dive into fantastical mysteries full time.\r\n\r\nGrowing up, Kade lived a military lifestyle of traveling to and living in new places. These experiences with distinctive cultures and geography instilled in Kade a sense of wanderlust and opened a young mind to the knowledge that the Earth is expansive and wild. A deep interest in science, ancient history, cultural anthropology, art, music, languages, and spirituality is evidenced by the diversity and richness of the places and cultures depicted in Kade’s writing.\r\n\r\nYou can visit Kade's website at www.kelkade.com."}
    );
  });

  test.todo('with about and no avatar', async () => {
    // haven't found one yet
  });

  test('with avatar and no about', async () => {
    const result = await Effect.runPromise(createProgram('B0BKWV52KN').pipe(Effect.provide(layer)));

    expect(result).toEqual(
      // prettier-ignore
      {asin:"B0BKWV52KN",name:"Nick Law",avatar:"https://images-na.ssl-images-amazon.com/images/S/amzn-author-media-prod/665gm56tkt925r15umarns7lgc._SX500_.jpg",about:null}
    );
  });
});

test.concurrent('narrator with ASIN', async () => {
  const result = await Effect.runPromise(createProgram('B0C9M9M74R').pipe(Effect.provide(layer)));

  expect(result).toEqual(
    // prettier-ignore
    {asin:"B0C9M9M74R",name:"Jeff David",avatar:"https://m.media-amazon.com/images/G/01/Audible/DesignSystem/Sandbox/Profile_large.png",about:null}
  );
});

test.concurrent('translator with ASIN', async () => {
  const result = await Effect.runPromise(createProgram('B000APTDDU').pipe(Effect.provide(layer)));

  expect(result).toEqual(
    // prettier-ignore
    {asin:"B000APTDDU",name:"Constance Garnett",avatar:"https://m.media-amazon.com/images/G/01/Audible/DesignSystem/Sandbox/Profile_large.png",about:"The subtitle of Richard Garnett's biography (reissued in Faber Finds) of his grandmother, Constance Garnett (1861-1946) is A Heroic Life. It couldn't be more apt. She remains the most prolific English translator of Russian literature: twelve volumes of Dostoevsky, five of Gogol, six of Herzen (his complete My Past and Thoughts), seventeen of Tchehov (her spelling), five of Tolstoy, eleven of Turgenev and so on. Many of these will be appearing in Faber Finds. In all she translated over sixty works. It is not, however, the sheer quantity that is to be celebrated, though that in itself is remarkable, it is more the enduring quality of her work. Of course there have been critics - translation is a peculiarly controversial subject, but there have been many more admirers. Tolstoy himself praised her. Of her Turgenev translations, Joseph Conrad said 'Turgeniev (sic) for me is Constance Garnett and Constance Garnett is Turgeniev'. Katherine Mansfield declared the lives of her generation of writers were transformed by Constance Garnett's translations, and H. E. Bates went so far as to say that modern English Literature itself could not have been what it is without her translations.\r\n\r\nThis extraordinary achievement was accomplished despite poor health and poor eyesight, the latter being ruined by her labours on War and Peace, a tragic if fitting sacrifice; her's indeed was A Heroic Life."}
  );
});
