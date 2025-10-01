import { Path } from '@effect/platform';
import { Effect, Schema } from 'effect';

import { Audible, ProductBookSchema } from '@/router/v1/library/audible';
import { FsExtended } from '@/router/v1/library/fsExtended';
import { gatherAuxiliaryAudiobookData } from '@/router/v1/library/identifying/gatherAuxiliaryAudiobookData';
import { insertAudiobook } from '@/router/v1/library/identifying/insertAudiobook';
import { extractAudiobookFileMetadata } from '@/router/v1/library/scanning/extractAudiobookFileMetadata';
import { prepareAudiobookFile } from '@/router/v1/library/scanning/prepareAudiobookFile';

export const forceIdentifyAudiobook = (input: {
  libraryId: number;
  asin: string;
  files: { directory: string; name: string }[];
}) =>
  Effect.gen(function* () {
    const fs = yield* FsExtended;
    const path = yield* Path.Path;

    const fileStats = yield* Effect.forEach(input.files, (file) =>
      fs.lstat(path.join(file.directory, file.name)).pipe(
        Effect.catchTags({
          BadArgument: () =>
            Effect.fail({
              message: 'Error getting info for file',
              description: path.join(file.directory, file.name),
            } as const),
          SystemError: () =>
            Effect.fail({
              message: 'Error getting info for file',
              description: path.join(file.directory, file.name),
            } as const),
        }),
        Effect.map((stat) => ({
          parentPath: file.directory,
          name: file.name,
          isDirectory: stat.isDirectory,
          isSymbolicLink: stat.isSymbolicLink,
        }))
      )
    );

    const files = yield* Effect.forEach(fileStats, (file) =>
      prepareAudiobookFile({
        parentPath: file.parentPath,
        name: file.name,
        isDirectory: file.isDirectory,
        isSymbolicLink: file.isSymbolicLink,
      }).pipe(
        Effect.catchTags({
          StatError: (error) =>
            Effect.fail({
              message: 'Error getting info for file',
              description: error.message,
            } as const),
          DirectoryError: () =>
            Effect.fail({
              message: 'Cannot use directories in identifications',
              description: path.join(file.parentPath, file.name),
            } as const),
          NoExtensionError: () =>
            Effect.fail({
              message: "File doesn't have an extension",
              description: path.join(file.parentPath, file.name),
            } as const),
          UnsupportedExtensionError: () =>
            Effect.fail({
              message: "File doesn't have an extension that is supported by this library",
              description: path.join(file.parentPath, file.name),
            } as const),
          RealpathError: () =>
            Effect.fail({
              message: 'Cannot resolve symbolic link',
              description: path.join(file.parentPath, file.name),
            }),
        }),
        Effect.map((data) => ({ ...data, path: path.join(file.parentPath, file.name) }))
      )
    );

    const fileMetadata = yield* Effect.forEach(files, (file) =>
      fs.open(file.path, 'r').pipe(
        Effect.catchTags({
          BadArgument: () =>
            Effect.fail({
              message: 'Invalid file descriptor',
              description: file.path,
            } as const),
          SystemError: () =>
            Effect.fail({
              message: 'Cannot open file',
              description: file.path,
            } as const),
        }),
        Effect.andThen((fd) =>
          fs.partialHash(fd).pipe(
            Effect.catchTags({
              BadArgument: () =>
                Effect.fail({
                  message: 'Invalid file descriptor',
                  description: file.path,
                } as const),
              SystemError: () =>
                Effect.fail({
                  message: 'Could not calculate partial hash of file',
                  description: file.path,
                } as const),
            }),
            Effect.map((hash) => ({ fd, hash }))
          )
        ),
        Effect.andThen((result) =>
          extractAudiobookFileMetadata({
            fileDescriptor: result.fd,
          }).pipe(
            Effect.catchTags({
              // TODO: write a test for this case! we want the file's metadata,
              // even if it doesn't have album title or artist name
              NoAlbumTitleOrArtistNameError: (error) => Effect.succeed(error.data),
              FFProbeKnownError: () =>
                Effect.fail({
                  message: 'Error while extracting metadata for file',
                  description: file.path,
                } as const),
              FFProbeUnknownError: () =>
                Effect.fail({
                  message: 'Unknown error while extracting metadata for file',
                  description: file.path,
                } as const),
              BunShellSyntaxError: () =>
                Effect.fail({
                  message: 'Failed to parse metadata output for file',
                  description: file.path,
                } as const),
              ParseError: () =>
                Effect.fail({
                  message: 'Extracted metadata was not in the expected format for file',
                  description: file.path,
                } as const),
              UnknownException: () =>
                Effect.fail({
                  message: 'Unknown error while extracting metadata for file',
                  description: file.path,
                } as const),
            }),
            Effect.map((metadata) => ({
              ...metadata,
              ...file,
              partialFileHash: result.hash,
            }))
          )
        ),
        Effect.scoped
      )
    );

    const audible = yield* Audible;
    const product = yield* audible.getProductByAsin({ asin: input.asin }).pipe(
      Effect.catchTags({
        ParseError: () =>
          Effect.fail({
            message: 'Error while parsing response for full book data',
          } as const),
        RequestError: () =>
          Effect.fail({
            message: 'Error while fetching full book data',
          } as const),
        ResponseError: () =>
          Effect.fail({
            message: 'Error while processing response for full book data',
          } as const),
      })
    );

    if (!Schema.is(ProductBookSchema)(product)) {
      return yield* Effect.fail({
        message: 'The provided ASIN was not for a book',
      } as const);
    }

    const book = yield* gatherAuxiliaryAudiobookData(product);

    return yield* insertAudiobook({
      ...book,
      libraryId: input.libraryId,
      files: fileMetadata,
    }).pipe(
      Effect.catchTags({
        NoContributorsError: (error) => Effect.fail({ message: error.message } as const),
        NoFilesError: (error) => Effect.fail({ message: error.message } as const),
        KnownSQLiteError: () =>
          Effect.fail({ message: 'Database error while inserting audiobook' } as const),
        NotFoundError: () =>
          Effect.fail({ message: 'Database error while inserting audiobook' } as const),
        QueryError: () =>
          Effect.fail({ message: 'Database error while inserting audiobook' } as const),
      })
    );
  });
