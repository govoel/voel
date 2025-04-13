import { deleteEmptyDirectories } from './machine';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { exists, mkdir, readdir, rmdir } from 'node:fs/promises';
import { dirname, join as pathJoin, resolve as pathResolve } from 'node:path';

describe('delete empty directories', () => {
  let libraryPath: string;
  const libraryName = 'test_library';

  const cases = [
    [
      'simple case with some empty directories',
      {
        directories: new Set(['a/aa', 'a/bb/bbb', 'a/cc/', 'b/', 'c/']),
        files: new Set(['a/bb/bbb/z.txt', 'a/bb/bbb/y.txt']),
      },
    ],
    [
      'nested empty directories',
      {
        directories: new Set(['empty1/empty2/empty3', 'empty4/empty5', 'empty6']),
        files: new Set<string>(),
      },
    ],
    [
      'mixed case with deep nesting',
      {
        directories: new Set([
          'content/docs/images',
          'content/blog/drafts',
          'content/blog/published',
          'empty/nested/very/deep',
        ]),
        files: new Set(['content/docs/images/logo.png', 'content/blog/published/post1.md']),
      },
    ],
    [
      'no empty directories',
      {
        directories: new Set(['data/photos', 'data/videos']),
        files: new Set(['data/photos/img1.jpg', 'data/videos/vid1.mp4', 'data/videos/vid2.mp4']),
      },
    ],
    [
      'file at root level',
      {
        directories: new Set(['empty1', 'empty2']),
        files: new Set(['rootfile.txt']),
      },
    ],
    [
      'complex case with interleaved empty and non-empty directories',
      {
        directories: new Set([
          'a/b/c/d',
          'a/b/empty',
          'a/empty1/empty2',
          'a/files/subfolder',
          'x/y/z',
          'standalone',
        ]),
        files: new Set(['a/b/c/file.txt', 'a/files/document.pdf']),
      },
    ],
    [
      'empty library',
      {
        directories: new Set<string>(),
        files: new Set<string>(),
      },
    ],
    [
      'handle "hidden" directories correctly',
      {
        directories: new Set(['.hidden', '.hidden/subfolder']),
        files: new Set(['.hidden/file.txt']),
      },
    ],
  ] as const;

  beforeEach(async () => {
    process.env.IMPORT_PATH = pathResolve('.', 'dev_dir', 'import');
    libraryPath = pathJoin(process.env.IMPORT_PATH, libraryName);
    await mkdir(libraryPath, { recursive: true });
  });

  afterEach(async () => {
    await rmdir(libraryPath, { recursive: true });
  });

  test.each(cases)('%s', async (name, { directories, files }) => {
    await Promise.all([
      ...directories.values().map((dir) => mkdir(pathJoin(libraryPath, dir), { recursive: true })),
      ...files.values().map((file) => Bun.write(pathJoin(libraryPath, file), 'test')),
    ]);

    await deleteEmptyDirectories(libraryName);

    const dirsToExist = new Set<string>();
    for (const file of files) {
      expect(await Bun.file(pathJoin(libraryPath, file)).exists()).toBe(true);
      dirsToExist.add(dirname(pathJoin(libraryPath, file)));
    }

    const remainingDirs = await readdir(libraryPath, { recursive: true, withFileTypes: true });
    for (const dir of remainingDirs) {
      if (dir.isDirectory()) {
        expect(await exists(pathJoin(dir.parentPath, dir.name))).toBe(
          dirsToExist.values().find((v) => v.startsWith(pathJoin(dir.parentPath, dir.name))) !==
            undefined
        );
      }
    }

    expect(await exists(pathJoin(libraryPath))).toBe(true);
  });
});
