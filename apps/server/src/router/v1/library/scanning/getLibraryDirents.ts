import { Chunk, Data, Effect, Stream } from 'effect';

class DirectoryIteratorError extends Data.TaggedError('DirectoryIteratorError')<{
  error: string;
}> {}

export const getLibraryDirents = Effect.fn(function* <
  T extends { name: string; parentPath: string },
>(dir: AsyncIterable<T>) {
  const ignoredDirs = new Set<string>();
  return yield* Stream.fromAsyncIterable(
    dir,
    (err) => new DirectoryIteratorError({ error: String(err) })
  ).pipe(
    Stream.map((entry) => {
      if (entry.name === '.nomedia' || entry.name === '.voelignore') {
        ignoredDirs.add(entry.parentPath);
      }
      return entry;
    }),
    Stream.runCollect,
    Effect.catchTag('DirectoryIteratorError', (error) =>
      Effect.logError('Error while getting library directory entries').pipe(
        Effect.annotateLogs('error', error.error),
        Effect.as(Chunk.empty<T>())
      )
    ),
    Effect.map((e) => Chunk.filter(e, (dirent) => !ignoredDirs.has(dirent.parentPath)))
  );
});
