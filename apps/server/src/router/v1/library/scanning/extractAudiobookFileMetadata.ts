import { Data, Effect } from 'effect';

import { FFProbeStdoutSchema, FsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';

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

class UpToDateError extends Data.TaggedError('UpToDateError')<{
  message: string;
  data: {
    metadata: typeof FFProbeStdoutSchema.Type;
    metadataHash: string;
    normalizedTags: Record<string, string>;
    albumTitle?: string;
    artistName?: string;
    discNumber: number;
    trackNumber: number;
  };
}> {}

class NoAlbumTitleOrArtistNameError extends Data.TaggedError('NoAlbumTitleOrArtistNameError')<{
  message: string;
  data: {
    metadata: typeof FFProbeStdoutSchema.Type;
    metadataHash: string;
    normalizedTags: Record<string, string>;
    albumTitle?: string;
    artistName?: string;
    discNumber: number;
    trackNumber: number;
  };
}> {}

export const extractAudiobookFileMetadata = ({
  file,
}: {
  file: Readonly<{
    metadataHashFromDb: string | undefined;
    path: string;
  }>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FsExtended;
    const hash = yield* Hash;

    yield* Effect.annotateLogsScoped({ path: file.path });

    const metadata = yield* fs.ffprobe({ path: file.path });

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

    // ok to compute hash on parsed metadata only instead of raw metadata
    // because if we ever change what we parse, the file gets re-processed
    const metadataHash = yield* hash.rapidhash({
      data: JSON.stringify(metadata),
    });

    if (file.metadataHashFromDb === metadataHash) {
      return yield* Effect.fail(
        new UpToDateError({
          message: 'File is up to date',
          data: {
            metadata,
            metadataHash,
            normalizedTags,
            albumTitle,
            artistName,
            discNumber,
            trackNumber,
          },
        })
      );
    }

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
            metadataHash,
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
      metadataHash,
      normalizedTags,
      albumTitle,
      artistName,
      discNumber,
      trackNumber,
    };
  }).pipe(Effect.scoped);
