import { describe, expect, test } from 'bun:test';
import { Effect, Layer, LogLevel, Logger, ParseResult } from 'effect';

import { Audible } from '@/router/v1/library/audible';

const createProgram = (asin: string) =>
  Effect.gen(function* () {
    const audible = yield* Audible;
    return yield* audible.getProductByAsin({ asin });
  });

const layer = Layer.merge(Logger.minimumLogLevel(LogLevel.None), Audible.Default);

describe('books', () => {
  test('author without ASIN', async () => {
    const result = await Effect.runPromise(createProgram('B0DT29BJGC').pipe(Effect.provide(layer)));

    expect(result).toEqual(
      // prettier-ignore
      {asin:"B0DT29BJGC",format_type:"unabridged",is_adult_product:false,series:[{asin:"B0DT7GY283",title:"The Land of Broken Roads"}],title:"Ancient Things: A High Fantasy Adventure",subtitle:"The Land of Broken Roads, Book 1",copyright:"©2025 Ryan English (P)2025 Podium Audio",publisher_name:"Podium Audio",product_images:{"500":"https://m.media-amazon.com/images/I/51JPc5o5IJL._SL500_.jpg"},publisher_summary_md:"**In a world of wonder, mystery, and lurking threats, a young boy and a giant wolf must rely on each other to escape the things that hunt them both.**\n\nThe age of mankind is over, its empire reduced to a land of rubble and broken roads. Vicious things nest in the old, forgotten ruins, and what's left of humanity huddles in tiny communities that grow smaller every generation. But when a young boy is taken in by an unlikely ally, a glimmer of hope is born.\n\nAfter waking up in a mysterious forest with no weapons, supplies, or even memories of his life before, Dirt should have ended up a barely adequate snack. Luckily, he attracts the attention of a gigantic, curious wolf pup, who rescues him, and they quickly become friends.\n\nThe world is beautiful and wondrous, perfect for a pair of adventurous youngsters, but that doesn't mean it's safe. Dirt is small and frail, and the mighty Socks has problems of his own. His Mother, an immense being of unfathomable power, sets a high bar for her offspring. If Socks can't meet the challenge, he'll die. Mother's not too fond of the clingy little human he insists on keeping either.\n\nIf the two of them are to survive long enough to grow up, they'll need all of Dirt's sincerity, discipline, and cunning as well as Socks's valor and tremendous strength. And they'll also need to beware: not everything that was lost should be rediscovered, and not everything that sleeps should be disturbed.\n\n**The first volume of the hit fantasy adventure series—with more than a million views on Royal Road—now available on Kindle, Kindle Unlimited, and Audible!**",content_delivery_type:"SinglePartBook",relationships:[{asin:"B0DT7GY283",content_delivery_type:"BookSeries",relationship_type:"series",relationship_to_product:"parent",title:"The Land of Broken Roads",sequence:"1",sort:1}],contributors:[{asin:undefined,name:"Ryan English",role:"author"},{asin:undefined,name:"Peter Kenny",role:"narrator"}]}
    );
  });

  describe('authors transform to editors/translators', () => {
    test('has author and translator', async () => {
      const result = await Effect.runPromise(
        createProgram('B0DXRD5C4F').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"B0DXRD5C4F",format_type:"unabridged",is_adult_product:false,series:[{asin:"B0DXVW9PX4",title:"Blood Code"}],title:"The Blood Code #1",subtitle:undefined,copyright:"©2025 Michael Borz; English translation copyright 2025 by Boris Smirnov (P)2025 Tantor Media",publisher_name:"Tantor Media",product_images:{"500":"https://m.media-amazon.com/images/I/51wEoTEWCZL._SL500_.jpg"},publisher_summary_md:"In my past life, I heeded the Blood Code: I rescued people, slaying monsters from the inner plane. For my trouble the Inquisition condemned me for blood lust and burned me at the stake.\n\nAnd in my current life my family is dishonored in the eyes of the emperor, there's a bounty on my head, and I'm the subject of a divine dispute. Well then, no better time than now to surprise them all. Give me but a drop of blood—and the hunter will become the prey.\n\nI am Mikhail Komarin. The Blood of my bloodline guards my back! And I still heed the Code.",content_delivery_type:"SinglePartBook",relationships:[{asin:"B0DXVW9PX4",content_delivery_type:"BookSeries",relationship_type:"series",relationship_to_product:"parent",title:"Blood Code",sequence:"1",sort:1}],contributors:[{asin:"B0DJPQVTNL",name:"Michael Borz",role:"author"},{asin:undefined,name:"Boris Smirnov",role:"translator"},{asin:undefined,name:"Spencer Dillehay",role:"narrator"}]}
      );
    });

    test('has author and translators', async () => {
      const result = await Effect.runPromise(
        createProgram('197734447X').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"197734447X",format_type:"unabridged",is_adult_product:false,series:undefined,title:"The Lives of the Artists",subtitle:undefined,copyright:"©1991 Julia Conaway Bondanella and Peter Bondanella (translation and editorial material) (P)2019 Tantor",publisher_name:"Tantor Audio",product_images:{"500":"https://m.media-amazon.com/images/I/51k6TN3Jv5L._SL500_.jpg"},publisher_summary_md:"These biographies of the great quattrocento artists have long been considered among the most important of contemporary sources on Italian Renaissance art. Vasari, who invented the term \"Renaissance\", was the first to outline the influential theory of Renaissance art that traces a progression through Giotto, Brunelleschi, and finally the titanic figures of Michaelangelo, Da Vinci, and Raphael.\n\nThis new translation, specially commissioned for the Oxford World's Classics series, contains 36 of the most important lives. _Lives of the Artists_ is an invaluable classic to add to your collection.",content_delivery_type:"MultiPartBook",relationships:[{asin:"B07RMZN6CH",relationship_type:"component",relationship_to_product:"child",sort:2},{asin:"B07RN2F389",relationship_type:"component",relationship_to_product:"child",sort:1}],contributors:[{asin:"B001IGO52Y",name:"Giorgio Vasari",role:"author"},{asin:undefined,name:"Julia Conway Bondanella",role:"translator"},{asin:undefined,name:"Peter Bondanella",role:"translator"},{asin:undefined,name:"James Cameron Stewart",role:"narrator"}]}
      );
    });

    test('has authors and translator', async () => {
      const result = await Effect.runPromise(
        createProgram('B0F257T6XN').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"B0F257T6XN",format_type:"unabridged",is_adult_product:false,series:[{asin:"B0DNPRWSQY",title:"The Dark Healer"}],title:"The Dark Healer: Book 6",subtitle:undefined,copyright:"©2025 Alex Toxic, Nadya Lee; English translation copyright 2025 by Dan Veksler (P)2025 Tantor Media",publisher_name:"Tantor Media",product_images:{"500":"https://m.media-amazon.com/images/I/51b6Q8yaWTL._SL500_.jpg"},publisher_summary_md:"After finding an abandoned, ancient fortress inside a focus, the Richters turn it into their headquarters and a training camp for their new army.\n\nIt's becoming harder and harder to conceal the truth. A big war is right around the corner.",content_delivery_type:"SinglePartBook",relationships:[{asin:"B0DNPRWSQY",content_delivery_type:"BookSeries",relationship_type:"series",relationship_to_product:"parent",title:"The Dark Healer",sequence:"6",sort:6}],contributors:[{asin:"B0D5F9KTKM",name:"Nadya Lee",role:"author"},{asin:"B0CBG84X29",name:"Alex Toxic",role:"author"},{asin:undefined,name:"Dan Veksler",role:"translator"},{asin:undefined,name:"Christopher P. Brown",role:"narrator"}]}
      );
    });

    test('has author and editor', async () => {
      const result = await Effect.runPromise(
        createProgram('1400170052').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"1400170052",format_type:"unabridged",is_adult_product:false,series:undefined,title:"The Constitution of Liberty",subtitle:"The Definitive Edition",copyright:"©1960, 2011 the University of Chicago (P)2019 Tantor",publisher_name:"Tantor Audio",product_images:{"500":"https://m.media-amazon.com/images/I/51i4AWTv84L._SL500_.jpg"},publisher_summary_md:"From the $700 billion bailout of the banking industry to president Barack Obama's $787 billion stimulus package to the highly controversial passage of federal health-care reform, conservatives and concerned citizens alike have grown increasingly fearful of big government.\n\n_The Constitution of Liberty_ is considered Hayek's classic statement on the ideals of freedom and liberty, ideals that he believes have guided - and must continue to guide - the growth of Western civilization. Here, Hayek defends the principles of a free society, casting a skeptical eye on the growth of the welfare state and examining the challenges to freedom posed by an ever-expanding government - as well as its corrosive effect on the creation, preservation, and utilization of knowledge. In opposition to those who call for the state to play a greater role in society, Hayek puts forward a nuanced argument for prudence. Guided by this quality, he elegantly demonstrates that a free market system in a democratic polity - under the rule of law and with strong constitutional protections of individual rights - represents the best chance for the continuing existence of liberty.",content_delivery_type:"MultiPartBook",relationships:[{asin:"B07VXM4JP6",relationship_type:"component",relationship_to_product:"child",sort:1},{asin:"B07VZTRPQJ",relationship_type:"component",relationship_to_product:"child",sort:2}],contributors:[{asin:"B000AQ6W60",name:"F. A. Hayek",role:"author"},{asin:undefined,name:"Ronald Hamowy",role:"editor"},{asin:undefined,name:"Mike Chamberlain",role:"narrator"}]}
      );
    });

    test('has author and non-conformant editor', async () => {
      const result = await Effect.runPromise(
        createProgram('B004HGZW06').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"B004HGZW06",format_type:"unabridged",is_adult_product:false,series:undefined,title:"The Autobiography of Mark Twain",subtitle:undefined,copyright:"©1959 Charles Neider (P)1995 Blackstone Audio, Inc.",publisher_name:"Blackstone Audio, Inc.",product_images:{"500":"https://m.media-amazon.com/images/I/4122jPjRepL._SL500_.jpg"},publisher_summary_md:"Mark Twain’s daughter Susy wrote: “Papa…doesn’t like to go to church at all, why I never understood, until just now, he told us the other day that he couldn’t bear to hear any one talk but himself, but that he could listen to himself talk for hours without getting tired, of course he said this in joke, but I’ve no dought \\[sic\\] it was founded on truth.\"\n\nHere is one of the great autobiographies of the English language - exuberant, wonderfully contemporary in spirit, by a man twice as large as life who—he said so himself—had no trouble remembering everything that had ever happened to him and a lot of things besides.\n\nNothing ever happened to Mark Twain in a small way. His adventures were invariably fraught with drama. Success and failure for him were equally spectacular. And so he roared down the years, feuding with publishers, being a sucker for inventors, always learning wisdom at the point of ruin, and always relishing the absurd spectacle of humankind, which he regarded with a blend of vitriol and affection.",content_delivery_type:"MultiPartBook",relationships:[{asin:"B004HGXU4Q",relationship_type:"component",relationship_to_product:"child",sort:3},{asin:"B004HGSTDS",relationship_type:"component",relationship_to_product:"child",sort:2},{asin:"B004HGSTC4",relationship_type:"component",relationship_to_product:"child",sort:1}],contributors:[{asin:"B000APWHJ2",name:"Mark Twain",role:"author"},{asin:undefined,name:"Edited by Charles Neider",role:"editor"},{asin:undefined,name:"Michael Anthony",role:"narrator"}]}
      );
    });

    test('has editors and narrators only (no authors)', async () => {
      const result = await Effect.runPromise(
        createProgram('B0DVLXQ8QM').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"B0DVLXQ8QM",format_type:"unabridged",is_adult_product:false,series:undefined,title:"The Oxford Handbook of Jorge Luis Borges",subtitle:undefined,copyright:"©2024 Oxford University Press (P)2025 Highbridge Audio",publisher_name:"Highbridge Audio",product_images:{"500":"https://m.media-amazon.com/images/I/41i6T6WW4rL._SL500_.jpg"},publisher_summary_md:"Most known for his creative fictions that tackle literary questions of authorship as well as more philosophical notions such as multiverse theory, Argentine author Jorge Luis Borges (1899-1986) has captivated scholars from a variety of disciplines since his emergence on the international scene. However, much of the scholarship surrounding Borges does not focus on the reception of Borges's works in the fields of philosophy, the visual arts, film, political science, media theory, mathematics, and law, nor does it consider how his affiliations and interests changed over the course of his long life.  \n  \nIn _The Oxford Handbook of Jorge Luis Borges_, editors Daniel Balderston and Nora Benedict, along with a team of international scholars, contextualize Jorge Luis Borges's work for a new generation of twenty-first-century listeners and critics. This volume shifts the emphasis to Borges's working life, his writing processes, his collaborations and networks, and the political and cultural background of his production. The Handbook also evaluates his impact on a variety of other fields ranging from political science and philosophy to media studies and mathematics. The volume highlights current debates among Borges scholars, reevaluating how the physical forms and socio-political contexts of Borges's writings both shaped and determined specific readerships around the world.",content_delivery_type:"MultiPartBook",relationships:[{asin:"B0FK5V1R1Z",relationship_type:"component",relationship_to_product:"child",sort:3},{asin:"B0FK5VPT1Q",relationship_type:"component",relationship_to_product:"child",sort:2},{asin:"B0FK5VTCQF",relationship_type:"component",relationship_to_product:"child",sort:1}],contributors:[{asin:undefined,name:"Oxford Handbooks",role:"editor"},{asin:undefined,name:"Daniel Balderston",role:"editor"},{asin:undefined,name:"Nora Benedict",role:"editor"},{asin:undefined,name:"Emmanuel Chumaceiro",role:"narrator"}]}
      );
    });

    test('has editors, foreword by, and narrators only (no authors)', async () => {
      const result = await Effect.runPromise(
        createProgram('B0DV17RHSW').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"B0DV17RHSW",format_type:"unabridged",is_adult_product:false,series:undefined,title:"This Is Chaos",subtitle:"Embracing the Future of Magic",copyright:"©2025 Peter J. Carroll; Foreword by Ronald Hutton copyright 2025 by Red Wheel/Weiser, LLC (P)2025 Tantor Media",publisher_name:"Tantor Media",product_images:{"500":"https://m.media-amazon.com/images/I/51m4JZEWN-L._SL500_.jpg"},publisher_summary_md:"**_This Is Chaos_** **is the first collection of its kind showcasing where chaos magic has come from, where it is now, and where it is going. Helmed by one of the originators of chaos magic, Peter Carroll, and filled with essays by some of the most respected chaos magic workers who are redefining magic.**  \n  \nChaos magic emerged only a few decades back, but it has already grown into a magical tradition embraced by many. Chaos magic started under the influence of renowned artist and occultist Austin Osman Spare; it was then codified by Peter J. Carroll and a few others. _This Is Chaos_ delves into the history the magical system has come from, but more importantly looks at its use and what the future holds. Chaos magic has always been about pushing boundaries with a focus on belief utilizing aspects of magic.  \n  \nFeaturing a foreword by Ronald Hutton and essays from chaos magic practitioners, including Aidan Wachter, Carl Abrahamsson, Dave Lee, Ivy Corvus, Jaq D. Hawkins, Jozef Karika, Jacob Sipes, Julian Vayne, Lionel Snell, Mariana Pinzón, Sinobu Kurono, and Sanhre Daffowt.  \n  \n_This Is Chaos_ is a collection unlike any before, showcasing the many ways chaos magic is finding its way into other modes of magic.",content_delivery_type:"SinglePartBook",relationships:undefined,contributors:[{asin:undefined,name:"Peter J. Carroll",role:"editor"},{asin:undefined,name:"Ronald Hutton",role:"foreword"},{asin:undefined,name:"Gareth Richards",role:"narrator"}]}
      );
    });

    test('has no narrators and no product_images', async () => {
      const result = await Effect.runPromise(
        createProgram('B0FLYHTBS3').pipe(Effect.provide(layer))
      );

      expect(result).toEqual(
        // prettier-ignore
        {asin:"B0FLYHTBS3",format_type:"unabridged",is_adult_product:false,series:undefined,title:"A Vast Horizon",subtitle:"Artists and Lovers, Freedom and War",copyright:"©2026 Anna Thomasson (P)2026 Macmillan Publishers International Limited",publisher_name:"Picador",product_images:undefined,publisher_summary_md:"**Late summer 1937. Europe is inching towards war. In the South of France a group of friends picnic in a secluded clearing. The women have peeled down their dresses to their waists. A couple kiss playfully while the others look on, laughing. The moment is captured in a now-iconic image by photographer Lee Miller.**\n\nSome of the friends are well known, others less so: the dancer Ady Fidelin, the poet Paul Éluard and his wife Nusch, the Surrealists Man Ray and Roland Penrose. They are spending the summer with fellow artists Dora Maar, Eileen Agar and Pablo Picasso.\n\nIn _A Vast Horizon_, biographer Anna Thomasson tells the story of their creativity, friendships and pursuit of freedom set against the tense political backdrop of the 1930s, the Second World War and its aftermath. Tracing their lives through their photographs, artworks, poems and letters, from the heady weeks of creativity, sex and collaboration of that Mediterranean summer through the tumultuous years that followed, it is the story of rebellious lives and the redemptive power of art.",content_delivery_type:"SinglePartBook",relationships:undefined,contributors:[{asin:undefined,name:"Anna Thomasson",role:"author"}]}
      );
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

    expect(result).toEqual(
      // prettier-ignore
      {asin:"B002UUKHII",format_type:"abridged",is_adult_product:false,series:undefined,title:"The Art of Seduction",subtitle:"An Indispensible Primer on the Ultimate Form of Power",copyright:"©2001 Robert Greene and Joost Elfers (P)2001 HighBridge Company",publisher_name:"HighBridge, a division of Recorded Books",product_images:{"500":"https://m.media-amazon.com/images/I/41pjoMsqWUL._SL500_.jpg"},publisher_summary_md:"When raised to the level of art, seduction, an indirect and subtle form of power, has toppled empires, won elections, and enslaved great minds. _The Art of Seduction_ synthesizes the legacies of civilization's greatest seducers - from Cleopatra to JFK - with the philosophies of important intellectuals on the subject, including everyone from Freud to Kierkegaard and Ovid to Casanova, and the classic literature of seduction. Robert Greene identifies the rules of a timeless, amoral game and explores how to cast a spell, break down resistance, and, ultimately, compel a target to surrender. _The Art of Seduction_ is an indispensable primer on the essence of one of history's greatest weapons and the ultimate form of power.",content_delivery_type:"SinglePartBook",relationships:[{asin:"B002VETW5C",content_delivery_type:"Bundle",relationship_type:"component",relationship_to_product:"parent",title:"The Art of Seduction",sort:1},{asin:"B0038BYYD2",content_delivery_type:"Bundle",relationship_type:"component",relationship_to_product:"parent",title:"The Art of Seduction + Audible Fast Company, Free 1-Month Subscription",sort:1}],contributors:[{asin:"B001IGV3IS",name:"Robert Greene",role:"author"},{asin:"B0C9M9M74R",name:"Jeff David",role:"narrator"}]}
    );
  });

  test('abridged books parse correctly and translator has ASIN', async () => {
    const result = await Effect.runPromise(createProgram('B002V8KQUI').pipe(Effect.provide(layer)));

    expect(result).toEqual(
      // prettier-ignore
      {asin:"B002V8KQUI",format_type:"abridged",is_adult_product:false,series:undefined,title:"Brothers Karamazov",subtitle:undefined,copyright:"Public Domain (P)2005 Mission Audio",publisher_name:"Mission Audio",product_images:{"500":"https://m.media-amazon.com/images/I/61k+uH49+2L._SL500_.jpg"},publisher_summary_md:"_The Brothers Karamazov_ is Dostoevsky's crowning life work and stands among the best novels in world literature.\n\nThe book probes the possible roles of four brothers in the unresolved murder of their father, Fyodor Karamazov. At the same time, it carefully explores the personalities and inclinations of the brothers themselves. Their psyches together represent the full spectrum of human nature, the continuum of faith and doubt.\n\nUltimately, this novel seeks to understand the real meaning of faith and existence and includes much beneficial philosophical and spiritual discussion that moves the reader towards faith. An incredibly enjoyable and edifying story!",content_delivery_type:"MultiPartBook",relationships:[{asin:"B002V8KR4I",relationship_type:"component",relationship_to_product:"child",sort:2},{asin:"B002V8H3A4",relationship_type:"component",relationship_to_product:"child",sort:3},{asin:"B002V8KQZ8",relationship_type:"component",relationship_to_product:"child",sort:1}],contributors:[{asin:"B000APYSC6",name:"Fyodor Dostoevsky",role:"author"},{asin:"B000APTDDU",name:"Constance Garnett",role:"translator"},{asin:undefined,name:"Simon Vance",role:"narrator"}]}
    );
  });

  test('adult books parse correctly', async () => {
    const result = await Effect.runPromise(createProgram('B0FDH3GFZW').pipe(Effect.provide(layer)));

    expect(result).toEqual(
      // prettier-ignore
      {asin:"B0FDH3GFZW",format_type:"unabridged",is_adult_product:true,series:[{asin:"B0FDMBRMPC",title:"The Boys of Chapel Crest"}],title:"Church",subtitle:"A Dark Asylum Bully Romance (The Boys of Chapel Crest, Book 1)",copyright:"©2022 K.G. Reuss (P)2025 Blue Nose Publishing",publisher_name:"Blue Nose Publishing",product_images:{"500":"https://m.media-amazon.com/images/I/51FQYNa14mL._SL500_.jpg"},publisher_summary_md:"The last time I spoke was eight years ago when my best friend tried to kill me. I never dreamed my silence would break with a scream. Being sent to Chapel Crest after my new stepfather deemed me a heathen seemed like a blessing compared to staying with him and my mom. I was a mute demon in his eyes, and when the rod didn’t beat the evil out of me, he prayed Chapel Crest could.\n\nI envisioned the religious academy would become my sanctuary. I was wrong. So very wrong. Chapel Crest was an asylum moonlighting as a religious school. It's where the meds take out the demons in your head or the punishments from the staff will.\n\nIf this place and its rules didn’t break me, Dante Church and his cult of bullies would.\n\nThey called themselves the Watchers. They were dark and ruthless—everything a girl like me should avoid. But maybe something was wrong with me because the thought of being on my knees for the four devils appeals to me.\n\nEven if it meant I was praying for survival.\n\nGoing to Church took on a whole new meaning at Chapel Crest.\n\nChurch is book one of The Boys of Chapel Crest. It’s a dark bully romance with four guys chasing one girl. There is no choosing. Only begging. And lots of praying. Please listen to the foreword.",content_delivery_type:"MultiPartBook",relationships:[{asin:"B0FDMBRMPC",content_delivery_type:"BookSeries",relationship_type:"series",relationship_to_product:"parent",title:"The Boys of Chapel Crest",sequence:"1",sort:1},{asin:"B0FDH6JGCH",relationship_type:"component",relationship_to_product:"child",sort:2},{asin:"B0FDH5WBG6",relationship_type:"component",relationship_to_product:"child",sort:1}],contributors:[{asin:"B01I9YU2JM",name:"K.G. Reuss",role:"author"},{asin:undefined,name:"Stella Ripley",role:"narrator"},{asin:undefined,name:"Joe Arden",role:"narrator"},{asin:undefined,name:"Edward Black",role:"narrator"},{asin:undefined,name:"J. Tipstone",role:"narrator"},{asin:undefined,name:"Michael Gallagher",role:"narrator"},{asin:undefined,name:"Sean Masters",role:"narrator"}]}
    );
  });

  test('summary is in markdown format', async () => {
    const result = await Effect.runPromise(createProgram('1774241307').pipe(Effect.provide(layer)));

    expect(result).toEqual(
      // prettier-ignore
      {asin:"1774241307",format_type:"unabridged",is_adult_product:false,series:[{asin:"B085CDYDYS",title:"The Beginning After the End"}],title:"The Beginning After the End: Publisher's Pack",subtitle:undefined,copyright:"©2016 TurtleMe (P)2019 Podium Publishing",publisher_name:"Podium Audio",product_images:{"500":"https://m.media-amazon.com/images/I/518ZH-6fZBL._SL500_.jpg"},publisher_summary_md:"_The Beginning After the End: Publisher's Pack_ contains books 1 and 2 of The Beginning After the End series.\n\n_Early Years_, book one:\n\nI never believed in the whole “light at the end of the tunnel” folly where people, after having a near-death experience, would startle awake in a cold sweat exclaiming, “I saw the light!” But there I was, in this so-called “tunnel” facing a glaring light, when the last thing I remembered was sleeping in my room - the royal bed-chamber, as others called it. Had I died? If so, how?\n\nKing Grey once benefited from unrivaled strength, wealth, and prestige in a world governed by martial ability but now finds himself reborn in a society dominated by magic. Given a second chance at life, the once-king strives to understand his role in this new world and the purpose of his reincarnation while correcting the mistakes of his past.\n\n_New Heights_, book two:\n\nI had a family now, I had people who loved me. It was a feeling I never wanted to give up. I’d treasure it, fight for it if I had to...and for that, I needed to better myself. More so even than when I had been a king.\n\nGiven a second chance at life, Arthur Leywin wishes above all to grow strong enough to protect his family, as the memory of his cold and disconnected past life as King Grey still haunts him. To this end, Arthur adopts the persona of the masked adventurer, Note, and delves into the dungeons under the forbidding Beast Glades. On his adventures, Arthur discovers a strange magical blade that responds to the dragon’s will inside him, befriends a powerful young conjurer whose past is shrouded in mystery, and battles the deadly Elderwood Guardian. Yet all his efforts might prove for naught when Arthur makes an enemy of a talented conjurer from a very powerful family, putting his very future at risk.",content_delivery_type:"MultiPartBook",relationships:[{asin:"B081VY12MQ",relationship_type:"component",relationship_to_product:"child",sort:2},{asin:"B081W9KM7J",relationship_type:"component",relationship_to_product:"child",sort:1},{asin:"B085CDYDYS",content_delivery_type:"BookSeries",relationship_type:"series",relationship_to_product:"parent",title:"The Beginning After the End",sequence:"1-2",sort:1}],contributors:[{asin:"B01CXXPTTI",name:"TurtleMe",role:"author"},{asin:undefined,name:"Travis Baldree",role:"narrator"}]}
    );
  });
});

describe('series', () => {
  test('summary is in markdown format', async () => {
    const result = await Effect.runPromise(createProgram('B085CDYDYS').pipe(Effect.provide(layer)));

    expect(result).toEqual(
      // prettier-ignore
      {content_delivery_type:"BookSeries",asin:"B085CDYDYS",authors:[{name:"TurtleMe"}],relationships:[{asin:"1774241307",relationship_type:"series",relationship_to_product:"child",sequence:"1-2",sort:1},{asin:"1774242028",relationship_type:"series",relationship_to_product:"child",sequence:"6",sort:8},{asin:"B0CCSW7C89",relationship_type:"series",relationship_to_product:"child",sequence:"10",sort:13},{asin:"1774244128",relationship_type:"series",relationship_to_product:"child",sequence:"7",sort:9},{asin:"177424201X",relationship_type:"series",relationship_to_product:"child",sequence:"5",sort:7},{asin:"B0DH5B625C",relationship_type:"series",relationship_to_product:"child",sequence:"4",sort:6},{asin:"B0DH64NC7D",relationship_type:"series",relationship_to_product:"child",sequence:"1",sort:3},{asin:"B09X6115SW",relationship_type:"series",relationship_to_product:"child",sequence:"8.5",sort:11},{asin:"1774242036",relationship_type:"series",relationship_to_product:"child",sequence:"3-4",sort:2},{asin:"B087GH7K9P",relationship_type:"series",relationship_to_product:"child",sequence:"3",sort:5},{asin:"1774248891",relationship_type:"series",relationship_to_product:"child",sequence:"8",sort:10},{asin:"B087GJNX7P",relationship_type:"series",relationship_to_product:"child",sequence:"2",sort:4},{asin:"B0DJPYFJ2K",relationship_type:"series",relationship_to_product:"child",sequence:"11",sort:14},{asin:"B0DH83CGBT",relationship_type:"series",relationship_to_product:"child",sequence:"11",sort:14},{asin:"B0DH5BRVW3",relationship_type:"series",relationship_to_product:"child",sequence:"3",sort:5},{asin:"B087GF3J9W",relationship_type:"series",relationship_to_product:"child",sequence:"1",sort:3},{asin:"B0B3C22MQS",relationship_type:"series",relationship_to_product:"child",sequence:"9",sort:12},{asin:"B0DH5RK8QK",relationship_type:"series",relationship_to_product:"child",sequence:"2",sort:4},{asin:"B087GS2BKT",relationship_type:"series",relationship_to_product:"child",sequence:"4",sort:6}],title:"The Beginning After the End",publisher_summary_md:"**Stripped of his power and thrown into the distant future, King Grey is certainly no longer in his previous life. How will he regain control in an unknown time and place where magical abilities rule?**\n\nOnce a powerful ruler, King Grey is now reborn as a baby, and must relearn how to navigate society in a whole new time, place, and body. Adapted from the beloved manga series, The Beginning After the End follows the main character through his journey of self-discovery as he attempts to conquer the new reality he has awoken in and find his way in a strange place and time full of magic and wonder.\n\nAuthor TurtleMe tells a powerful story of a king given a second chance at life. The Beginning After the End is packed with time travel and adventure, but also focuses on personal growth and explores what it means to be able to start over. The six books in the series follow the character development of King Grey after he is reincarnated as Arthur Leywin, a man whose life is a far cry from the royalty and power he once knew. Now, as Arthur, King Grey struggles to make the most of his fresh start in life and understand his place and purpose in this mystical world.\n\nEach audiobook in the series is narrated by Travis Baldree, an established narrator of close to 175 titles. Baldree brings the perfect level of enthusiasm and emphasis to this wild fantastic story, while maintaining a clear and crisp tone. His consistency over the entire series helps bring the story together for a singular must-listen."}
    );
  });
});
