import type { ComponentType } from 'react';

/** Render directly in an Android LazyColumn or an iOS List/Section so rows stay lazy. */
export type DetailRowsComponent = ComponentType<{
  readonly details: ReadonlyArray<{ readonly label: string; readonly value: string }>;
}>;
export declare const DetailRows: DetailRowsComponent;
