import { $ } from 'bun';
import type { Stats } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

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

const normalizeTagsToLowercase = <T extends Record<string, unknown>>(originalTags: T) => {
  if (!originalTags) return {};

  const normalizedTags = {} as Record<string, unknown>;
  Object.keys(originalTags).forEach((key) => {
    const normalizedKey = key.toLowerCase().replace('-', '_');
    if (!normalizedTags[normalizedKey]) {
      normalizedTags[normalizedKey] = originalTags[key];
    } else {
      scanLogger.error(
        '[Scan] Tag normalization: Duplicate key detected: "%s" => "%s"',
        key,
        originalTags[key]
      );
    }
  });

  return normalizedTags;
};

const extractTrackNumber = (...possibleTrackTags: unknown[]) => {
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

export interface AudioFile {
  path: string;
  realPath: string;
  stats: Stats;
  metadata: { format: { tags: Record<string, string> }; stream: unknown[]; chapters?: unknown[] };
  sortMetadata: { discNumber: number; trackNumber: number };
}

export const getAudioFile = async (filePath: string): Promise<AudioFile | null> => {
  try {
    const fullPath = join(filePath);

    const lastDotIndex = fullPath.lastIndexOf('.');
    if (lastDotIndex === -1) {
      scanLogger.debug('[Scan] File skipped (no extension): "%s"', fullPath);
      return null;
    }

    if (!SUPPORTED_AUDIO_EXTENSIONS.has(fullPath.substring(lastDotIndex + 1).toLowerCase())) {
      scanLogger.debug('[Scan] File skipped (unsupported extension): "%s"', fullPath);
      return null;
    }

    const fileStats = await Bun.file(fullPath).stat();
    if (fileStats.isDirectory()) {
      scanLogger.debug('[Scan] File skipped (is a directory): "%s"', fullPath);
      return null;
    }

    const resolvedPath = await realpath(fullPath);
    if (fullPath === resolvedPath) {
      scanLogger.debug('[Scan] File skipped (not a symlink): "%s"', fullPath);
      return null;
    }

    scanLogger.debug({
      msg: '[Scan] File ok (symlink)',
      importPath: fullPath,
      pointsTo: resolvedPath,
    });

    const ffprobe =
      await $`ffprobe -v quiet -print_format json -show_error -show_format -show_chapters -show_streams '${fullPath}'`
        .nothrow()
        .quiet();

    const metadata = JSON.parse(new TextDecoder().decode(ffprobe.stdout));

    if (ffprobe.exitCode !== 0) {
      scanLogger.error(
        '[Scan] Metadata extraction failed with exit code %d for file "%s": %o',
        ffprobe.exitCode,
        fullPath,
        metadata
      );
      return null;
    }

    if (!('format' in metadata && 'tags' in metadata.format)) {
      scanLogger.error('[Scan] Metadata extraction failed for file "%s": %o', fullPath, metadata);
      return null;
    }

    const normalizedTags = normalizeTagsToLowercase(metadata.format.tags);
    metadata.format.tags = normalizedTags;

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

    scanLogger.debug('[Scan] Metadata extracted successfully for "%s"', filePath);

    return {
      path: fullPath,
      realPath: resolvedPath,
      stats: fileStats,
      metadata,
      sortMetadata: { discNumber, trackNumber },
    };
  } catch (error) {
    scanLogger.error('[Scan] Error validating audio file "%s": %s', filePath, error);
    return null;
  }
};
