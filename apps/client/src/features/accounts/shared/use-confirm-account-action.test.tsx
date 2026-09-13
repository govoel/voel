import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Effect, Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { Alert } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

import { useConfirmAccountAction } from './use-confirm-account-action.ts';

const runtime = Atom.runtime(Layer.empty);
afterEach(() => {
  vi.restoreAllMocks();
});

it('uses the caller’s confirmation intent, cancels without mutating, and prevents duplicate alerts', async () => {
  const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => void 0);
  const run = vi.fn(() => Effect.void);
  const mutation = runtime.fn(run);
  const onSuccess = vi.fn(() => void 0);
  const { result } = await renderHook(() =>
    useConfirmAccountAction({
      mutation,
      input: void 0,
      title: 'Unban user',
      message: 'Allow sign-in again?',
      intent: 'default',
      confirmLabel: 'Unban',
      successMessage: 'User unbanned.',
      onSuccess,
    })
  );
  await act(async () => {
    result.current.confirm();
    result.current.confirm();
  });
  expect(alert).toHaveBeenCalledTimes(1);
  const buttons = alert.mock.calls[0]?.[2];
  expect(buttons?.[1]).toMatchObject({ text: 'Unban', style: 'default' });
  await act(async () => {
    buttons?.[0]?.onPress?.();
  });
  expect(run).not.toHaveBeenCalled();

  await act(async () => {
    result.current.confirm();
  });
  expect(alert).toHaveBeenCalledTimes(2);
  await act(async () => {
    alert.mock.calls[1]?.[2]?.[1]?.onPress?.();
  });
  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledOnce();
  });
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.current.feedback).toBe('User unbanned.');
});
