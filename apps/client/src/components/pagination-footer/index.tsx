import type { ComponentType } from 'react';

export type PaginationFooterComponent = ComponentType<{
  readonly page: { readonly items: ReadonlyArray<unknown>; readonly done: boolean };
  readonly waiting: boolean;
  readonly onLoadMore: () => void;
}>;

/** Mount after the rows, keyed by item count so appended pages get a fresh visibility check. */
export declare const PaginationFooter: PaginationFooterComponent;
