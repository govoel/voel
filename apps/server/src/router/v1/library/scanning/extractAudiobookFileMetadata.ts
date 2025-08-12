import { FsExtended } from '../fsExtended';
import { Hash } from '../hash';
import { Path } from '@effect/platform';
import { Effect, Either, Option, ParseResult } from 'effect';

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

export const extractAudiobookFileMetadata = (
  file: Readonly<{
    metadataHashFromDb: string | undefined;
    mtimeMs: number;
    parentPath: string;
    name: string;
    realPath: string | undefined;
  }>
) =>
  Effect.gen(function* () {
    const fs = yield* FsExtended;
    const path = yield* Path.Path;
    const hash = yield* Hash;

    yield* Effect.annotateLogsScoped({ path: path.join(file.parentPath, file.name) });

    const metadata = yield* Effect.either(
      fs.ffprobe({
        path: path.join(file.parentPath, file.name),
      })
    );

    if (Either.isLeft(metadata)) {
      if (metadata.left._tag === 'BunShellError') {
        yield* Effect.logError(`Failed to extract metadata`, metadata.left.stdout);
      } else if (metadata.left._tag === 'BunShellSyntaxError') {
        yield* Effect.logError('Failed to parse metadata output');
      } else if (metadata.left._tag === 'ParseError') {
        yield* Effect.logError(
          `Metadata was not in the expected format: ${ParseResult.TreeFormatter.formatErrorSync(metadata.left)}`
        );
      } else {
        yield* Effect.logError('Unexpected error while extracting metadata', {
          error: metadata.left,
        });
      }

      return Option.none();
    }

    // ok to compute hash on parsed metadata only instead of raw metadata
    // because if we ever change what we parse, the file gets re-processed
    const metadataHash = yield* hash.rapidhash({
      data: JSON.stringify(metadata.right),
    });

    if (file.metadataHashFromDb === metadataHash) {
      return Option.none();
    }

    const normalizedTags = yield* Effect.reduce(
      Object.entries(metadata.right.format.tags),
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

    if (
      albumTitle === undefined ||
      albumTitle.length === 0 ||
      artistName === undefined ||
      artistName.length === 0
    ) {
      yield* Effect.logError('Missing album title or artist name', {
        albumTitle,
        artistName,
      });

      return Option.none();
    }

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

    return Option.some({
      parentPath: file.parentPath,
      name: file.name,
      realPath: file.realPath,
      mtimeMs: file.mtimeMs,
      metadata: metadata.right,
      metadataHash,
      normalizedTags,
      albumTitle,
      artistName,
      discNumber,
      trackNumber,
    });
  }).pipe(Effect.scoped);
