import { Chunk, Effect, Stream } from 'effect';

export const getLibraryDirents = Effect.fn(function* <
  T extends { name: string; parentPath: string },
>(dir: AsyncIterable<T>) {
  const ignoreDirents = new Set<string>();
  return yield* Stream.fromAsyncIterable(dir, (err) => new Error(String(err))).pipe(
    Stream.map((entry) => {
      if (entry.name === '.nomedia' || entry.name === '.voelignore') {
        ignoreDirents.add(entry.parentPath);
      }
      return entry;
    }),
    Stream.runCollect,
    Effect.catchAll((error) =>
      Effect.logError('Error while getting library directory entries').pipe(
        Effect.annotateLogs('error', error.message),
        Effect.as(Chunk.empty<T>())
      )
    ),
    Effect.map((e) => Chunk.filter(e, (dirent) => !ignoreDirents.has(dirent.parentPath)))
  );
});
