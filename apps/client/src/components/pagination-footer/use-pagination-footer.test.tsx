import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

import { usePaginationFooter } from '#src/components/pagination-footer/use-pagination-footer.ts';

describe('pagination footer', () => {
  it('loads only on native visibility and ignores duplicate events for the same page', async () => {
    const onLoadMore = vi.fn<() => void>();
    const props = { page: { items: [1], done: false }, waiting: false, onLoadMore };
    const { result, rerender } = await renderHook(usePaginationFooter, { initialProps: props });
    expect(onLoadMore).not.toHaveBeenCalled();

    await act(() => {
      result.current(true);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await act(() => {
      result.current(false);
    });
    await act(() => {
      result.current(true);
    });
    await rerender({ ...props });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('resumes after a pending page finishes while the footer remains visible, including terminal pulls', async () => {
    const onLoadMore = vi.fn<() => void>();
    const props = { page: { items: [1], done: false }, waiting: true, onLoadMore };
    const { result, rerender } = await renderHook(usePaginationFooter, { initialProps: props });
    await act(() => {
      result.current(true);
    });
    expect(onLoadMore).not.toHaveBeenCalled();

    await rerender({ ...props, waiting: false });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await rerender({ ...props, page: { ...props.page, done: true }, waiting: false });
    await act(() => {
      result.current(false);
    });
    await act(() => {
      result.current(true);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('checks visibility afresh for appended pages and stops when the footer leaves the viewport', async () => {
    const onLoadMore = vi.fn<() => void>();
    const first = await renderHook(usePaginationFooter, {
      initialProps: { page: { items: [1], done: false }, waiting: false, onLoadMore },
    });
    await act(() => {
      first.result.current(true);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    // Screens key the footer by item count, remounting after an append.
    await first.unmount();
    const next = await renderHook(usePaginationFooter, {
      initialProps: { page: { items: [1, 2], done: false }, waiting: true, onLoadMore },
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await act(() => {
      next.result.current(true);
    });
    await act(() => {
      next.result.current(false);
    });
    await next.rerender({ page: { items: [1, 2], done: false }, waiting: false, onLoadMore });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await act(() => {
      next.result.current(true);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('can drain an empty initial page to discover stream completion', async () => {
    const onLoadMore = vi.fn<() => void>();
    const { result } = await renderHook(usePaginationFooter, {
      initialProps: { page: { items: [], done: false }, waiting: false, onLoadMore },
    });
    await act(() => {
      result.current(true);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
