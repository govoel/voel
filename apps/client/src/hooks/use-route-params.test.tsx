import { renderHook } from '@testing-library/react-native';
import { Result } from 'effect';
import type { Schema } from 'effect';
import { beforeEach, expect, expectTypeOf, it, vi } from 'vitest';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const params = vi.hoisted(() => vi.fn<() => Record<string, string | Array<string>>>());
vi.mock('expo-router', () => ({ useLocalSearchParams: params }));

beforeEach(() => {
  params.mockReturnValue({ id: '42' });
});

it('returns decoded, branded parameters and follows valid and invalid route changes', async () => {
  const { result, rerender } = await renderHook(() => useRouteParams(LibraryParams));
  expectTypeOf(result.current).toEqualTypeOf<
    Result.Result<{ readonly id: typeof Library.fields.id.Type }, Schema.SchemaError>
  >();
  expect(result.current).toEqual(Result.succeed({ id: 42 }));
  params.mockReturnValue({ id: 'invalid' });
  await rerender(void 0);
  expect(result.current).toMatchObject({ _tag: 'Failure', failure: { _tag: 'SchemaError' } });
  params.mockReturnValue({ id: '43' });
  await rerender(void 0);
  expect(result.current).toEqual(Result.succeed({ id: 43 }));
});

it.each([
  { value: {} },
  { value: { id: ['42', '43'] } },
  { value: { id: 'invalid' } },
  { value: { id: '-1' } },
  { value: { id: '1.5' } },
])('returns a schema failure without throwing for $value', async ({ value }) => {
  params.mockReturnValue(value);
  const { result } = await renderHook(() => useRouteParams(LibraryParams));
  expect(result.current).toMatchObject({ _tag: 'Failure', failure: { _tag: 'SchemaError' } });
});
