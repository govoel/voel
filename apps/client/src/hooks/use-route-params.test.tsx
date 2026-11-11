import { renderHook } from '@testing-library/react-native';
import { Result } from 'effect';
import { expect, it, vi } from 'vitest';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const params = vi.hoisted(() => vi.fn<() => Record<string, string | Array<string>>>());
vi.mock('expo-router', () => ({ useLocalSearchParams: params }));

it('decodes parameters and recovers when an invalid route becomes valid', async () => {
  params.mockReturnValue({ id: '42' });
  const { result, rerender } = await renderHook(() => useRouteParams(LibraryParams));
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
  { value: { id: '-1' } },
  { value: { id: '1.5' } },
])('returns a schema failure without throwing for $value', async ({ value }) => {
  params.mockReturnValue(value);
  const { result } = await renderHook(() => useRouteParams(LibraryParams));
  expect(result.current).toMatchObject({ _tag: 'Failure', failure: { _tag: 'SchemaError' } });
});
