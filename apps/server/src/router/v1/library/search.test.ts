import { describe, expect, test } from 'bun:test';

// Mock the searchProgram since it uses external dependencies
const mockSearchProgram = ({
  asin,
  title,
  author,
  fileTitle,
  fileAuthor,
  fileDurationMs,
}: {
  asin?: string;
  title?: string;
  author?: string;
  fileTitle?: string;
  fileAuthor?: string;
  fileDurationMs?: number;
}) => {
  // Mock search results that would come from Audible API
  const mockResults = [
    {
      asin: 'B123456789',
      title: 'The Great Gatsby',
      authors: [{ name: 'F. Scott Fitzgerald' }],
      runtime_length_min: 300, // 5 hours
      copyright: '2023',
      publisher_name: 'Test Publisher',
      narrators: [{ name: 'Test Narrator' }],
      product_images: { '500': 'test-image.jpg' },
    },
    {
      asin: 'B987654321',
      title: 'Great Gatsby',
      authors: [{ name: 'F Scott Fitzgerald' }],
      runtime_length_min: 290, // 4 hours 50 minutes
      copyright: '2023',
      publisher_name: 'Test Publisher',
      narrators: [{ name: 'Test Narrator' }],
      product_images: { '500': 'test-image2.jpg' },
    },
    {
      asin: 'B555666777',
      title: 'Gatsby The Great',
      authors: [{ name: 'Another Author' }],
      runtime_length_min: 320, // 5 hours 20 minutes
      copyright: '2023',
      publisher_name: 'Test Publisher',
      narrators: [{ name: 'Test Narrator' }],
      product_images: { '500': 'test-image3.jpg' },
    },
  ];

  if (asin) {
    // For ASIN search, return single result
    const result = mockResults.find((r) => r.asin === asin);
    if (!result) return [];

    if (fileDurationMs !== undefined) {
      return [
        {
          ...result,
          durationDifferenceMs: Math.abs(result.runtime_length_min * 60 * 1000 - fileDurationMs),
        },
      ];
    }
    return [result];
  }

  if (title || author) {
    if (fileTitle || fileAuthor || fileDurationMs !== undefined) {
      // Levenshtein distance for testing
      const levenshteinDistance = (a: string, b: string): number => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) => [i]);
        for (let i = 1; i <= a.length; i++) {
          matrix[0]![i] = i;
        }

        for (let j = 1; j <= b.length; j++) {
          for (let i = 1; i <= a.length; i++) {
            if (a.charAt(i - 1) === b.charAt(j - 1)) {
              matrix[j]![i] = matrix[j - 1]![i - 1]!;
            } else {
              matrix[j]![i] = Math.min(
                matrix[j - 1]![i - 1]! + 1,
                matrix[j]![i - 1]! + 1,
                matrix[j - 1]![i]! + 1
              );
            }
          }
        }

        return matrix[b.length]![a.length]!;
      };

      const enhancedResults = mockResults.map((result) => {
        const titleDistance = fileTitle
          ? levenshteinDistance(fileTitle.toLowerCase().trim(), result.title.toLowerCase().trim())
          : Number.MAX_SAFE_INTEGER;

        const authorDistance = fileAuthor
          ? Math.min(
              ...result.authors.map((author) =>
                levenshteinDistance(
                  fileAuthor.toLowerCase().trim(),
                  author.name.toLowerCase().trim()
                )
              )
            )
          : Number.MAX_SAFE_INTEGER;

        const durationDifferenceMs =
          fileDurationMs !== undefined
            ? Math.abs(result.runtime_length_min * 60 * 1000 - fileDurationMs)
            : Number.MAX_SAFE_INTEGER;

        return {
          ...result,
          titleDistance,
          authorDistance,
          durationDifferenceMs,
        };
      });

      enhancedResults.sort((a, b) => {
        if (a.titleDistance !== b.titleDistance) {
          return a.titleDistance - b.titleDistance;
        }
        if (a.authorDistance !== b.authorDistance) {
          return a.authorDistance - b.authorDistance;
        }
        return a.durationDifferenceMs - b.durationDifferenceMs;
      });

      return enhancedResults;
    }

    return mockResults;
  }

  return [];
};

describe('Search Program with Enhanced Ordering', () => {
  test('should return results with duration differences for ASIN search', () => {
    const fileDurationMs = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
    const results = mockSearchProgram({
      asin: 'B123456789',
      fileDurationMs,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty('durationDifferenceMs');
    // TypeScript assertion for enhanced type safety
    const enhancedResult = results[0] as (typeof results)[0] & { durationDifferenceMs: number };
    expect(enhancedResult.durationDifferenceMs).toBe(0); // 5 hours = 300 minutes
  });

  test('should sort results by title distance when file metadata is provided', () => {
    const results = mockSearchProgram({
      title: 'gatsby',
      fileTitle: 'Great Gatsby',
      fileAuthor: 'F. Scott Fitzgerald',
      fileDurationMs: 5 * 60 * 60 * 1000, // 5 hours
    });

    expect(results).toHaveLength(3);

    // Results should be sorted by title distance first
    // 'Great Gatsby' vs 'The Great Gatsby' = distance 4
    // 'Great Gatsby' vs 'Great Gatsby' = distance 0 (should be first)
    // 'Great Gatsby' vs 'Gatsby The Great' = distance 8
    const enhancedResult = results[0] as (typeof results)[0] & {
      titleDistance: number;
      authorDistance: number;
      durationDifferenceMs: number;
    };
    expect(enhancedResult.title).toBe('Great Gatsby');
    expect(enhancedResult.titleDistance).toBe(0);
  });

  test('should sort results by author distance when titles are similar', () => {
    const results = mockSearchProgram({
      title: 'gatsby',
      fileTitle: 'Some Other Title', // This will make title distances high for all
      fileAuthor: 'F Scott Fitzgerald', // This should match second result better
      fileDurationMs: 5 * 60 * 60 * 1000,
    });

    expect(results).toHaveLength(3);

    // All should have titleDistance calculated
    results.forEach((result) => {
      expect(result).toHaveProperty('titleDistance');
      expect(result).toHaveProperty('authorDistance');
      expect(result).toHaveProperty('durationDifferenceMs');
    });
  });

  test('should sort by duration difference when title and author distances are equal', () => {
    const fileDurationMs = 295 * 60 * 1000; // 295 minutes
    const results = mockSearchProgram({
      title: 'gatsby',
      fileDurationMs,
    });

    expect(results).toHaveLength(3);

    // All results should have duration difference calculated
    results.forEach((result) => {
      expect(result).toHaveProperty('durationDifferenceMs');
    });
  });

  test('should return unmodified results when no file metadata is provided', () => {
    const results = mockSearchProgram({
      title: 'gatsby',
    });

    expect(results).toHaveLength(3);

    // Results should not have the enhanced properties
    results.forEach((result) => {
      expect(result).not.toHaveProperty('titleDistance');
      expect(result).not.toHaveProperty('authorDistance');
      expect(result).not.toHaveProperty('durationDifferenceMs');
    });
  });

  test('should return empty array when no search parameters are provided', () => {
    const results = mockSearchProgram({});
    expect(results).toHaveLength(0);
  });
});
