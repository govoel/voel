import { getLibraryDirents } from './getLibraryDirents';
import { describe, expect, test } from 'bun:test';
import { Chunk, Effect } from 'effect';

describe.concurrent('getLibraryDirents', () => {
  test('returns all dirents when no ignore marker files are present', async () => {
    const entries = [
      { name: 'a.mp3', parentPath: '/root' },
      { name: 'b.mp3', parentPath: '/root/sub' },
    ];

    const asyncIterable = (async function* () {
      for (const e of entries) yield e;
    })();

    const result = await Effect.runPromise(getLibraryDirents(asyncIterable));

    expect(result.ignoredDirs).toBeEmpty();
    expect(Chunk.toArray(result.files)).toEqual(entries);
  });

  test('filters out dirents whose parentPath matches a discovered .nomedia file', async () => {
    const entries = [
      { name: '.nomedia', parentPath: '/root/sub' },
      { name: 'a.mp3', parentPath: '/root/sub' },
      { name: 'b.mp3', parentPath: '/root' },
    ];

    const asyncIterable = (async function* () {
      for (const e of entries) yield e;
    })();

    const result = await Effect.runPromise(getLibraryDirents(asyncIterable));

    expect([...result.ignoredDirs]).toEqual(['/root/sub']);
    expect(Chunk.toArray(result.files)).toEqual([{ name: 'b.mp3', parentPath: '/root' }]);
  });

  test('filters out dirents whose parentPath matches a discovered .voelignore file', async () => {
    const entries = [
      { name: '.voelignore', parentPath: '/root/ignored' },
      { name: 'a.mp3', parentPath: '/root/ignored' },
      { name: 'b.mp3', parentPath: '/root' },
    ];

    const asyncIterable = (async function* () {
      for (const e of entries) yield e;
    })();

    const result = await Effect.runPromise(getLibraryDirents(asyncIterable));

    expect([...result.ignoredDirs]).toEqual(['/root/ignored']);
    expect(Chunk.toArray(result.files)).toEqual([{ name: 'b.mp3', parentPath: '/root' }]);
  });

  test('returns empty chunk when source iteration throws an error', async () => {
    const asyncIterable = (async function* () {
      yield { name: 'a.mp3', parentPath: '/root' };
      throw new Error('on purpose');
    })();

    const result = await Effect.runPromise(getLibraryDirents(asyncIterable));

    expect([...result.ignoredDirs]).toEqual([]);
    expect(Chunk.toArray(result.files)).toEqual([]);
  });

  test('does not ignore deeper subdirectories when .nomedia is present on parentPath only', async () => {
    const entries = [
      { name: '.nomedia', parentPath: '/root/sub' },
      { name: 'a.mp3', parentPath: '/root/sub' },
      { name: 'b.mp3', parentPath: '/root/sub/deeper' },
      { name: 'c.mp3', parentPath: '/root' },
    ];

    const asyncIterable = (async function* () {
      for (const e of entries) yield e;
    })();

    const result = await Effect.runPromise(getLibraryDirents(asyncIterable));

    expect([...result.ignoredDirs]).toEqual(['/root/sub']);
    // Only the entry with parentPath '/root/sub' should be removed.
    expect(Chunk.toArray(result.files)).toEqual([
      { name: 'b.mp3', parentPath: '/root/sub/deeper' },
      { name: 'c.mp3', parentPath: '/root' },
    ]);
  });

  test('honors multiple ignore markers at different parentPaths and only excludes exact matches', async () => {
    const entries = [
      { name: '.voelignore', parentPath: '/root/ignored' },
      { name: '.nomedia', parentPath: '/root/ignored/sub' },
      { name: 'a.mp3', parentPath: '/root/ignored' },
      { name: 'b.mp3', parentPath: '/root/ignored/sub' },
      { name: 'c.mp3', parentPath: '/root/ignored/sub/deeper' },
      { name: 'd.mp3', parentPath: '/root/other' },
    ];

    const asyncIterable = (async function* () {
      for (const e of entries) yield e;
    })();

    const result = await Effect.runPromise(getLibraryDirents(asyncIterable));

    expect([...result.ignoredDirs]).toEqual(['/root/ignored', '/root/ignored/sub']);
    // '/root/ignored' and '/root/ignored/sub' should be ignored exactly,
    // but '/root/ignored/sub/deeper' remains because the implementation
    // only ignores based on exact parentPath matches.
    expect(Chunk.toArray(result.files)).toEqual([
      { name: 'c.mp3', parentPath: '/root/ignored/sub/deeper' },
      { name: 'd.mp3', parentPath: '/root/other' },
    ]);
  });
});
