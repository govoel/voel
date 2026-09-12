import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { Effect } from 'effect';
import { StrictMode, useEffect, useImperativeHandle } from 'react';
import type { Ref } from 'react';
import { View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPagedView } from '@repo/native-paging';

interface NativeProps {
  readonly paging: { readonly pageSize: number; readonly maxResidentItems: number };
  readonly onPageRequest: (event: {
    readonly nativeEvent: { readonly id: string; readonly offset: number; readonly limit: number };
  }) => void;
  readonly onPageCancel: (event: { readonly nativeEvent: { readonly id: string } }) => void;
  readonly ref: Ref<{
    readonly resolvePage: (page: {
      readonly id: string;
      readonly items: ReadonlyArray<{
        readonly id: string;
        readonly value: { readonly name: string };
      }>;
      readonly total: number;
    }) => Promise<void>;
    readonly rejectPage: (request: { readonly id: string }) => Promise<void>;
  }>;
}
const native = vi.hoisted(() => ({
  renders: [] as Array<Omit<NativeProps, 'ref'>>,
  mounts: 0,
  resolvePage: vi.fn(async () => void 0),
  rejectPage: vi.fn(async () => void 0),
}));
vi.mock('expo', () => ({ requireNativeView: () => MockNativeView }));

const MockNativeView = ({ ref, ...props }: NativeProps) => {
  useEffect(() => {
    native.renders.push(props);
  });
  useImperativeHandle(
    ref,
    () => ({ resolvePage: native.resolvePage, rejectPage: native.rejectPage }),
    []
  );
  useEffect(() => {
    native.mounts += 1;
  }, []);
  return <View testID="native-paged-view" />;
};

const PagedView = createPagedView<object, { readonly name: string }>({ name: 'TestPagedView' });
const page = (name: string) => ({ items: [{ id: name, value: { name } }], total: 1 });
const latestView = () => {
  const view = native.renders.at(-1);
  if (!view) {
    throw new Error('Native view has not mounted');
  }
  return view;
};
const requestPage = (view: Omit<NativeProps, 'ref'>, id: string) => {
  view.onPageRequest({ nativeEvent: { id, offset: 0, limit: 50 } });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await cleanup();
  native.renders.length = 0;
  native.mounts = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('component-owned paging', () => {
  it('uses the latest fetchPage without recreating the native view', async () => {
    const screen = await render(<PagedView fetchPage={() => Effect.succeed(page('first'))} />);
    await screen.findByTestId('native-paged-view');
    expect(latestView().paging).toEqual({ pageSize: 50, maxResidentItems: 250 });
    await act(() => {
      requestPage(latestView(), 'view:1');
    });
    await waitFor(() => {
      expect(native.resolvePage).toHaveBeenLastCalledWith({ id: 'view:1', ...page('first') });
    });
    await screen.rerender(<PagedView fetchPage={() => Effect.succeed(page('second'))} />);
    await act(() => {
      requestPage(latestView(), 'view:2');
    });
    await waitFor(() => {
      expect(native.resolvePage).toHaveBeenLastCalledWith({ id: 'view:2', ...page('second') });
    });
    expect(native.mounts).toBe(1);
  });

  it('cancels old dataset work, ignores late events, and resets on sizing changes', async () => {
    const interrupted = vi.fn(() => void 0);
    const load = vi.fn(() => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(interrupted))));
    const screen = await render(<PagedView key="first-account" fetchPage={load} />);
    await screen.findByTestId('native-paged-view');
    const oldView = latestView();
    await act(() => {
      requestPage(oldView, 'old-view:1');
    });
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    await screen.rerender(<PagedView key="second-account" fetchPage={load} />);
    await waitFor(() => {
      expect(interrupted).toHaveBeenCalledTimes(1);
    });
    await act(() => {
      requestPage(oldView, 'old-view:2');
    });
    expect(load).toHaveBeenCalledTimes(1);
    await screen.rerender(
      <PagedView key="second-account" pageSize={10} maxResidentItems={30} fetchPage={load} />
    );
    await waitFor(() => {
      expect(latestView().paging).toEqual({ pageSize: 10, maxResidentItems: 30 });
    });
    expect(native.mounts).toBe(3);
    expect(native.resolvePage).not.toHaveBeenCalled();
    expect(native.rejectPage).not.toHaveBeenCalled();
  });

  it('has a live request scope after StrictMode effect replay and cancels on unmount', async () => {
    const interrupted = vi.fn(() => void 0);
    const load = vi.fn(() => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(interrupted))));
    const screen = await render(
      <StrictMode>
        <PagedView fetchPage={load} />
      </StrictMode>
    );
    await screen.findByTestId('native-paged-view');
    await act(() => {
      requestPage(latestView(), 'view:1');
    });
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    await screen.unmount();
    await waitFor(() => {
      expect(interrupted).toHaveBeenCalledTimes(1);
    });
  });
});
