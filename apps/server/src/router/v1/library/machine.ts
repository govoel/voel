import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Actor, createActor, setup } from 'xstate';

import { matchAlbumGroup } from '@/router/v1/library/matcher';
import { type AudioFile, getAudioFile } from '@/router/v1/library/scanner';

import { env } from '@/env';
import { scanLogger } from '@/logger';

const libraryActors = new Map<number, Actor<typeof libraryMachine>>();

export const getLibraryActor = (id: number, name: string) => {
  if (!libraryActors.has(id)) {
    libraryActors.set(id, createActor(libraryMachine, { input: { id, name } }).start());
  }
  return libraryActors.get(id)!;
};

export const removeLibraryActor = (id: number) => {
  const actor = libraryActors.get(id);
  if (actor) {
    actor.stop();
    return libraryActors.delete(id);
  }
  return false;
};

const libraryMachine = setup({
  types: {
    context: {} as { id: number; name: string },
    input: {} as { id: number; name: string },
  },
  actions: {
    scanImportPath: async ({ context, self }) => {
      const importPath = join(resolve(env.IMPORT_PATH), context.name);
      scanLogger.info('Starting library scan: %s', context.name);
      const directoryEntries = await readdir(importPath, {
        recursive: true,
        withFileTypes: true,
      });
      scanLogger.info('Found %d entries in library directory', directoryEntries.length);

      const audioFiles: AudioFile[] = [];
      for (let i = 0; i < directoryEntries.length; i += env.METADATA_EXTRACTION_BATCH_SIZE) {
        const batchPromises = [];
        const batchEnd = Math.min(i + env.METADATA_EXTRACTION_BATCH_SIZE, directoryEntries.length);

        for (let j = i; j < batchEnd; j++) {
          const entry = directoryEntries[j]!;
          if (entry.isDirectory()) {
            continue;
          }
          batchPromises.push(getAudioFile(join(entry.parentPath, entry.name)));
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach((result) => {
          if (result) {
            audioFiles.push(result);
          }
        });

        scanLogger.debug(
          'Got metadata for %d-%d of %d files',
          i + 1,
          batchEnd,
          directoryEntries.length
        );
      }

      scanLogger.debug(
        'Got metadata for %d valid audio files out of %d entries',
        audioFiles.length,
        directoryEntries.length
      );

      const albumGroups: { [albumKey: string]: AudioFile[] } = {};
      audioFiles.forEach((audioFile) => {
        const tags = audioFile.metadata.format.tags;
        const albumTitle = (tags['album'] || tags['title'])?.trim();
        const artistName = (tags['artist'] || tags['album_artist'])?.trim();

        const albumKey = `${albumTitle} by ${artistName}`;
        if (!albumGroups[albumKey]) {
          albumGroups[albumKey] = [];
        }
        albumGroups[albumKey].push(audioFile);
      });

      scanLogger.info(
        'Grouped %d files into %d distinct albums',
        audioFiles.length,
        Object.keys(albumGroups).length
      );

      Object.keys(albumGroups).forEach((albumKey) => {
        albumGroups[albumKey]!.sort((a, b) => {
          return (
            a.sortMetadata.discNumber - b.sortMetadata.discNumber ||
            a.sortMetadata.trackNumber - b.sortMetadata.trackNumber
          );
        });

        scanLogger.debug(
          'Album "%s": Sorted %d tracks by disc and track number',
          albumKey,
          albumGroups[albumKey]!.length
        );
      });

      const books = [];
      const albumGroupKeys = Object.keys(albumGroups);
      for (let i = 0; i < albumGroupKeys.length; i += env.MATCHER_BATCH_SIZE) {
        const batchPromises = [];
        const batchEnd = Math.min(i + env.MATCHER_BATCH_SIZE, albumGroupKeys.length);

        for (let j = i; j < batchEnd; j++) {
          const albumKey = albumGroupKeys[j]!;
          batchPromises.push(matchAlbumGroup(albumGroups[albumKey]![0]!));
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach((result) => {
          if (result) {
            books.push(result);
            scanLogger.debug(
              'Successfully identified book: %s by %s',
              result.title,
              result.authors?.map((a) => a.name).join(', ') || 'Unknown'
            );
          }
        });

        scanLogger.debug(
          'Matched album %d-%d of %d albums',
          i + 1,
          batchEnd,
          albumGroupKeys.length
        );
      }

      scanLogger.debug('Library scan complete: %s', importPath);
      scanLogger.debug(
        'Summary: %d files, %d albums, %d identified books',
        audioFiles.length,
        albumGroupKeys.length,
        books.length
      );

      self.send({ type: 'scanComplete' });
    },
  },
}).createMachine({
  id: 'library',
  initial: 'idle',
  context: (opts) => opts.input,
  states: {
    idle: {
      on: {
        scan: { target: 'scanning' },
        scanComplete: { target: undefined },
      },
    },
    scanning: {
      entry: [{ type: 'scanImportPath' }],
      on: {
        scan: { target: undefined },
        scanComplete: { target: 'idle' },
      },
    },
  },
});
