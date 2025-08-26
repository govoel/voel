import { levenshteinDistance } from './utils';
import { describe, expect, test } from 'bun:test';

describe('levenshteinDistance', () => {
  test('should return 0 for identical strings', () => {
    expect(levenshteinDistance('test', 'test')).toBe(0);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  test('should return length for empty string comparison', () => {
    expect(levenshteinDistance('', 'test')).toBe(4);
    expect(levenshteinDistance('test', '')).toBe(4);
  });

  test('should calculate correct distance for single character changes', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1); // substitution
    expect(levenshteinDistance('cat', 'cats')).toBe(1); // insertion
    expect(levenshteinDistance('cats', 'cat')).toBe(1); // deletion
  });

  test('should calculate correct distance for complex examples', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('flaw', 'lawn')).toBe(2);
    expect(levenshteinDistance('Saturday', 'Sunday')).toBe(3);
  });

  test('should be case sensitive', () => {
    expect(levenshteinDistance('Test', 'test')).toBe(1);
  });

  test('should work with audiobook title examples', () => {
    // Real-world examples for audiobook matching
    expect(levenshteinDistance('The Great Gatsby', 'Great Gatsby')).toBe(4);
    expect(levenshteinDistance('Harry Potter', "Harry Potter and the Philosopher's Stone")).toBe(
      28
    );
    expect(levenshteinDistance('1984', 'Nineteen Eighty-Four')).toBe(20);
  });
});
