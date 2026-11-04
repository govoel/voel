import { Array, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  LibraryNameInput,
  RootRow,
  newRootRow,
  parseLibraryId,
} from '#src/domains/library/management.ts';

describe('library management input', () => {
  it('requires a visible library name without changing valid display names', () => {
    const decode = Schema.decodeOption(LibraryNameInput);
    expect(Option.isNone(decode(''))).toBe(true);
    expect(Option.isNone(decode(' \n\t'))).toBe(true);
    expect(Option.getOrUndefined(decode('My audiobooks'))).toBe('My audiobooks');
  });
  it('accepts only canonical, valid library IDs', () => {
    expect(Option.getOrUndefined(parseLibraryId('12'))).toBe(12);
    for (const id of ['', '-1', '1.5', '01', '1e2', ' 1', 'Infinity', '9007199254740992', ['1']]) {
      expect(Option.isNone(parseLibraryId(id))).toBe(true);
    }
  });
  it('keeps paths intact and assigns distinct stable row keys', () => {
    const first = newRootRow('/media/books');
    const second = newRootRow('/media/With spaces ');
    expect(first.key).not.toBe(second.key);
    expect(Array.filter([first, second], (row) => row.key !== first.key)).toEqual([second]);
    expect(Option.getOrUndefined(Schema.decodeOption(RootRow)(second))).toEqual(second);
    expect(Option.isNone(Schema.decodeOption(RootRow)(newRootRow()))).toBe(true);
  });
});
