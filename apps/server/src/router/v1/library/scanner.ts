import { $ } from 'bun';
import { realpath } from 'node:fs/promises';
import { z } from 'zod';

import { scanLogger } from '@/logger';

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'm4b',
  'mp3',
  'm4a',
  'flac',
  'opus',
  'ogg',
  'oga',
  'mp4',
  'aac',
  'wma',
  'aiff',
  'wav',
  'webm',
  'webma',
  'mka',
  'awb',
  'caf',
  'mpg',
  'mpeg',
]);

const normalizeTagsToLowercase = <V>(originalTags: Record<string, V>) =>
  Object.entries(originalTags).reduce(
    (acc, [key, value]) => {
      const normalizedKey = key.toLowerCase().replace('-', '_');
      if (!acc[normalizedKey]) {
        acc[normalizedKey] = value;
      } else {
        scanLogger.error(
          '[Scan] Tag normalization: Duplicate key detected: "%s" => "%s"',
          key,
          value
        );
      }
      return acc;
    },
    {} as Record<string, V>
  );

const extractTrackNumber = (...possibleTrackTags: (string | undefined)[]) => {
  for (const tagValue of possibleTrackTags) {
    if (typeof tagValue !== 'string') continue;

    let trackNumberString = tagValue;
    const slashIndex = tagValue.indexOf('/');

    if (slashIndex !== -1) {
      trackNumberString = tagValue.substring(0, slashIndex);
    }

    trackNumberString = trackNumberString.trim();
    const parsedTrackNumber = parseInt(trackNumberString, 10);
    if (!isNaN(parsedTrackNumber)) {
      return parsedTrackNumber;
    }
  }

  return 0;
};

const ffprobeSchema = z.object({
  chapters: z.array(
    z.object({
      id: z.coerce.number(),
      start_time: z.coerce.number(),
      end_time: z.coerce.number(),
      tags: z.object({ title: z.string() }),
    })
  ),
  format: z.object({
    start_time: z.coerce.number(),
    duration: z.coerce.number(),
    tags: z.record(z.string(), z.string()),
  }),
});

export interface AudioFile {
  metadata: z.infer<typeof ffprobeSchema>;
  path: string;
  realPath: string;
  sortMetadata: { discNumber: number; trackNumber: number };
}

export const getAudioFile = async (importDirPath: string) => {
  try {
    const lastDotIndex = importDirPath.lastIndexOf('.');
    if (lastDotIndex === -1) {
      scanLogger.debug('[Scan] File skipped (no extension): "%s"', importDirPath);
      return null;
    }

    if (!SUPPORTED_AUDIO_EXTENSIONS.has(importDirPath.substring(lastDotIndex + 1).toLowerCase())) {
      scanLogger.debug('[Scan] File skipped (unsupported extension): "%s"', importDirPath);
      return null;
    }

    const resolvedPath = await realpath(importDirPath);
    if (importDirPath === resolvedPath) {
      scanLogger.debug('[Scan] File skipped (not a symlink): "%s"', importDirPath);
      return null;
    }

    const fileStats = await Bun.file(resolvedPath).stat();
    if (fileStats.isDirectory()) {
      scanLogger.debug('[Scan] File skipped (is a directory): "%s"', importDirPath);
      return null;
    }

    scanLogger.debug({
      msg: '[Scan] File ok (symlink)',
      importPath: importDirPath,
      pointsTo: resolvedPath,
    });

    const ffprobe =
      await $`ffprobe -v quiet -print_format json -show_error -show_format -show_chapters -show_streams '${importDirPath}'`
        .nothrow()
        .quiet();

    const metadataJson = JSON.parse(new TextDecoder().decode(ffprobe.stdout));

    if (ffprobe.exitCode !== 0) {
      scanLogger.error(
        '[Scan] Metadata extraction failed with exit code %d for file "%s": %o',
        ffprobe.exitCode,
        importDirPath,
        metadataJson
      );
      return null;
    }

    const metadata = await ffprobeSchema.safeParseAsync(metadataJson);

    if (metadata.error) {
      scanLogger.error(
        '[Scan] Metadata extraction failed for file "%s": %o',
        importDirPath,
        metadata.error.flatten()
      );
      return null;
    }

    const normalizedTags = normalizeTagsToLowercase(metadata.data.format.tags);
    metadata.data.format.tags = normalizedTags;

    const discNumber = extractTrackNumber(
      normalizedTags['discnumber'],
      normalizedTags['disc'],
      normalizedTags['disk'],
      normalizedTags['tpos'],
      normalizedTags['tpa']
    );

    const trackNumber = extractTrackNumber(
      normalizedTags['track'],
      normalizedTags['trck'],
      normalizedTags['trk']
    );

    scanLogger.debug('[Scan] Metadata extracted successfully for "%s"', importDirPath);

    return {
      path: importDirPath,
      realPath: resolvedPath,
      metadata: metadata.data,
      sortMetadata: { discNumber, trackNumber },
    } satisfies AudioFile;
  } catch (error) {
    scanLogger.error('[Scan] Error validating audio file "%s": %s', importDirPath, error);
    return null;
  }
};
