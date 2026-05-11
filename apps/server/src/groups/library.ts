import { Layer } from 'effect';

import { Api } from '@repo/spec-api';

import { LibraryRepository } from '#src/services/database/repos/library.ts';

export const LibraryHandlers = Layer.mergeAll(
  Api.toLayerHandler('libraryGet', (payload) => LibraryRepository.use((r) => r.get(payload))),
  Api.toLayerHandler('libraryList', (payload) => LibraryRepository.use((r) => r.list(payload))),
  Api.toLayerHandler('libraryUpsert', (payload) => LibraryRepository.use((r) => r.upsert(payload))),
  Api.toLayerHandler('libraryDelete', (payload) => LibraryRepository.use((r) => r.delete(payload)))
);
