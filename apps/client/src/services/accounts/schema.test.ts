import { describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';

import { ServerUrl } from '#src/services/accounts/schema.ts';

describe('ServerUrl', () => {
  it.each([
    'https://example.com',
    'https://EXAMPLE.com:443/',
    'http://localhost:3000',
    'http://192.168.1.10:8080/',
    'http://[::1]:3000',
  ])('validates %s without changing account/storage identity', (value) => {
    expect(Schema.decodeSync(ServerUrl)(value)).toBe(value);
  });

  it.each([
    '',
    'example.com',
    '//example.com',
    'file:///tmp',
    'mailto:reader@example.com',
    'ftp://example.com',
    'https://reader:password@example.com',
    'https://@example.com',
    'https://example.com/api',
    'https://example.com/api/..',
    'https://example.com?query=1',
    'https://example.com?',
    'https://example.com#fragment',
    'https://example.com#',
    ' https://example.com',
    'https://example.com ',
    'https://exa\tmple.com',
    'https://example.com\\',
  ])('rejects %s', (value) => {
    expect(Schema.is(ServerUrl)(value)).toBe(false);
  });
});
