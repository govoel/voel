import { act, renderHook } from '@testing-library/react-native';
import { Effect, Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { describe, expect, it, vi } from 'vitest';

import { useAccountMutation } from './use-account-mutation.ts';

const runtime = Atom.runtime(Layer.empty);

describe('useAccountMutation', () => {
  it('ignores repeated submits until the outstanding mutation completes', async () => {
    const completion = Promise.withResolvers<boolean>();
    const run = vi.fn(() => Effect.promise(async () => completion.promise));
    const mutation = runtime.fn(run);
    const { result } = await renderHook(() => useAccountMutation({ mutation }));
    await act(async () => {
      const first = result.current.execute(void 0);
      expect(await result.current.execute(void 0)).toBe(false);
      expect(await result.current.execute(void 0)).toBe(false);
      completion.resolve(true);
      expect(await first).toBe(true);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ phase: 'success' });
  });

  it('retains a typed failure and clears it after a successful retry', async () => {
    let fail = true;
    const mutation = runtime.fn(() =>
      fail ? Effect.fail({ _tag: 'NoActiveAccountError' as const }) : Effect.void
    );
    const { result } = await renderHook(() => useAccountMutation({ mutation }));
    await act(async () => {
      expect(await result.current.execute(void 0)).toBe(false);
    });
    expect(result.current.state).toEqual({
      phase: 'failure',
      message: 'No signed-in account is available.',
    });
    fail = false;
    await act(async () => {
      expect(await result.current.execute(void 0)).toBe(true);
    });
    expect(result.current.state).toEqual({ phase: 'success' });
  });

  it('releases the submission lock after a defect', async () => {
    let fail = true;
    const mutation = runtime.fn(() => (fail ? Effect.die('broken transport') : Effect.void));
    const { result } = await renderHook(() => useAccountMutation({ mutation }));
    await act(async () => {
      expect(await result.current.execute(void 0)).toBe(false);
    });
    expect(result.current.state.phase).toBe('failure');
    fail = false;
    await act(async () => {
      expect(await result.current.execute(void 0)).toBe(true);
    });
  });
});
