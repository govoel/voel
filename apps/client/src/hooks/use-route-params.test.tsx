import { renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from 'vitest';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { InvalidRouteParamsError, useRouteParams } from '#src/hooks/use-route-params.ts';

const params = vi.hoisted(() => vi.fn<() => Record<string, string | Array<string>>>());
vi.mock('expo-router', () => ({ useLocalSearchParams: params }));

beforeEach(() => {
  params.mockReturnValue({ id: '42' });
});
afterEach(() => {
  vi.restoreAllMocks();
});

it('returns decoded, branded parameters and follows route changes', async () => {
  const { result, rerender } = await renderHook(() => useRouteParams(LibraryParams));
  expectTypeOf(result.current.id).toEqualTypeOf<typeof Library.fields.id.Type>();
  expect(result.current).toEqual({ id: 42 });
  params.mockReturnValue({ id: '43' });
  await rerender(void 0);
  expect(result.current).toEqual({ id: 43 });
});

it.each([
  { value: {} },
  { value: { id: ['42', '43'] } },
  { value: { id: 'invalid' } },
  { value: { id: '-1' } },
  { value: { id: '1.5' } },
])('throws a route error preserving the schema failure for $value', async ({ value }) => {
  params.mockReturnValue(value);
  vi.spyOn(console, 'error').mockImplementation(() => void 0);
  await expect(renderHook(() => useRouteParams(LibraryParams))).rejects.toMatchObject({
    _tag: 'InvalidRouteParamsError',
    cause: { _tag: 'SchemaError' },
  });
});

it('does not classify unrelated errors as invalid parameters', () => {
  expect(InvalidRouteParamsError.is(new Error('Unexpected failure'))).toBe(false);
});
