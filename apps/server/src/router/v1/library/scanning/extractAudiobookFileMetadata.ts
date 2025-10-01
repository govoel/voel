import { Data, Effect } from 'effect';

import { FFProbeStdoutSchema, FsExtended } from '@/router/v1/library/fsExtended';

const extractNumberFromTags = (...possibleTags: (string | undefined)[]) => {
  for (const tagValue of possibleTags) {
    if (typeof tagValue !== 'string') continue;

    let tagValueString = tagValue;
    const slashIndex = tagValue.indexOf('/');

    if (slashIndex !== -1) {
      tagValueString = tagValue.substring(0, slashIndex);
    }

    tagValueString = tagValueString.trim();
    const parsedTrackNumber = parseInt(tagValueString, 10);
    if (!isNaN(parsedTrackNumber)) {
      return parsedTrackNumber;
    }
  }

  return 0;
};

class NoAlbumTitleOrArtistNameError extends Data.TaggedError('NoAlbumTitleOrArtistNameError')<{
  message: string;
  data: {
    metadata: typeof FFProbeStdoutSchema.Type;
    normalizedTags: Record<string, string>;
    albumTitle?: string;
    artistName?: string;
    discNumber: number;
    trackNumber: number;
  };
}> {}

export const extractAudiobookFileMetadata = ({ fileDescriptor }: { fileDescriptor: number }) =>
  Effect.gen(function* () {
    const fs = yield* FsExtended;

    const metadata = yield* fs.ffprobe(fileDescriptor);

    const normalizedTags = yield* Effect.reduce(
      Object.entries(metadata.format.tags),
      {} as Record<string, string>,
      (acc, [key, value]) =>
        Effect.gen(function* () {
          const normalizedKey = key.toLowerCase().replace('-', '_');
          if (!(normalizedKey in acc)) {
            acc[normalizedKey] = value;
          } else {
            yield* Effect.logWarning(`Duplicate metadata tag key: ${normalizedKey}`);
          }
          return acc;
        })
    );

    const albumTitle = (normalizedTags['album'] || normalizedTags['title'])?.trim();
    const artistName = (normalizedTags['artist'] || normalizedTags['album_artist'])?.trim();

    const discNumber = extractNumberFromTags(
      normalizedTags['discnumber'],
      normalizedTags['disc'],
      normalizedTags['disk'],
      normalizedTags['tpos'],
      normalizedTags['tpa']
    );

    const trackNumber = extractNumberFromTags(
      normalizedTags['track'],
      normalizedTags['trck'],
      normalizedTags['trk']
    );

    if (
      albumTitle === undefined ||
      albumTitle.length === 0 ||
      artistName === undefined ||
      artistName.length === 0
    ) {
      return yield* Effect.fail(
        new NoAlbumTitleOrArtistNameError({
          message: 'No album title or artist name found in metadata',
          data: {
            metadata,
            normalizedTags,
            albumTitle,
            artistName,
            discNumber,
            trackNumber,
          },
        })
      );
    }

    return {
      metadata,
      normalizedTags,
      albumTitle,
      artistName,
      discNumber,
      trackNumber,
    };
  });
