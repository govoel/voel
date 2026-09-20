import type { ComponentType } from 'react';

export type DetailRowsComponent = ComponentType<{
  readonly details: ReadonlyArray<{ readonly label: string; readonly value: string }>;
}>;
export declare const DetailRows: DetailRowsComponent;
