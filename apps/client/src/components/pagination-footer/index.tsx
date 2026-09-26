import type { ComponentProps, ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';

export type PaginationFooterComponent = ComponentType<{
  readonly page: { readonly items: ReadonlyArray<unknown>; readonly done: boolean };
  readonly waiting: boolean;
  readonly onLoadMore: () => void;
}>;

/** Mount after the rows, keyed by item count so appended pages get a fresh visibility check. */
export declare const PaginationFooter: PaginationFooterComponent;

export const usePaginationFooter = ({
  page,
  waiting,
  onLoadMore,
}: ComponentProps<PaginationFooterComponent>) => {
  const [visible, setVisible] = useState(false);
  const requestedPage = useRef<typeof page | null>(null);

  useEffect(() => {
    if (!visible || waiting || page.done || requestedPage.current === page) {
      return;
    }
    // Native visibility events can repeat before the atom publishes its waiting state.
    requestedPage.current = page;
    onLoadMore();
  }, [visible, waiting, page, onLoadMore]);

  return setVisible;
};
