import { Inspectable } from 'effect';

import type { AtomSnapshot, AtomSummary } from '@repo/atom-devtools-core';

export interface AtomLinkDto {
  readonly id: string;
  readonly name: string;
}

export interface AtomSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly writable: boolean;
  readonly overridden: boolean;
  readonly stateCapable: boolean;
}

export interface AtomSnapshotDto extends AtomSummaryDto {
  readonly value: string;
  readonly source?: string;
  readonly keepAlive: boolean;
  readonly lazy: boolean;
  readonly idleTTL?: number;
  readonly subscriberCount: number;
  readonly dependencies: readonly AtomLinkDto[];
  readonly dependents: readonly AtomLinkDto[];
  readonly states: readonly {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
  }[];
  readonly activeStateId?: string;
}

export const atomSummaryToDto = (atom: AtomSummary, stateCapable: boolean): AtomSummaryDto => ({
  id: atom.id,
  name: atom.name,
  writable: atom.writable,
  overridden: atom.overridden,
  stateCapable,
});

export const atomSnapshotToDto = (atom: AtomSnapshot): AtomSnapshotDto => ({
  ...atomSummaryToDto(atom, atom.states.length > 0),
  value: Inspectable.toStringUnknown(atom.value),
  ...(atom.source === void 0 ? {} : { source: atom.source }),
  keepAlive: atom.keepAlive,
  lazy: atom.lazy,
  ...(atom.idleTTL === void 0 ? {} : { idleTTL: atom.idleTTL }),
  subscriberCount: atom.subscriberCount,
  dependencies: atom.dependencies.map(({ id, name }) => ({ id, name })),
  dependents: atom.dependents.map(({ id, name }) => ({ id, name })),
  states: atom.states.map(({ description, id, label }) => ({
    id,
    label,
    ...(description === void 0 ? {} : { description }),
  })),
  ...(atom.activeStateId === void 0 ? {} : { activeStateId: atom.activeStateId }),
});
