import { Inspectable } from 'effect';

import type { AtomSnapshot, AtomSummary } from '@repo/atom-devtools-core';

export interface AtomLinkDto {
  readonly id: string;
  readonly name: string;
}

export interface PredefinedStateDto {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface AtomSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly writable: boolean;
  readonly overridden: boolean;
  readonly stateCapable: boolean;
}

export interface AtomSnapshotDto extends AtomSummaryDto {
  readonly value: JsonValue;
  readonly valuePreview: string;
  readonly source?: string;
  readonly keepAlive: boolean;
  readonly lazy: boolean;
  readonly idleTTL?: number;
  readonly subscriberCount: number;
  readonly dependencies: readonly AtomLinkDto[];
  readonly dependents: readonly AtomLinkDto[];
  readonly states: readonly PredefinedStateDto[];
  readonly activeStateId?: string;
}

export const atomSummaryToDto = (atom: AtomSummary, stateCapable: boolean): AtomSummaryDto => ({
  id: atom.id,
  name: atom.name,
  writable: atom.writable,
  overridden: atom.overridden,
  stateCapable,
});

const toJsonValue = (input: unknown, seen: WeakSet<object>): JsonValue => {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') {
    return input;
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : String(input);
  }
  if (typeof input === 'bigint' || typeof input === 'symbol' || typeof input === 'function') {
    return String(input);
  }
  if (input === undefined) {
    return '[undefined]';
  }
  if (seen.has(input)) {
    return '[Circular]';
  }
  seen.add(input);

  try {
    if (Array.isArray(input)) {
      return input.map((item) => toJsonValue(item, seen));
    }
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, toJsonValue(value, seen)])
    );
  } catch {
    return Inspectable.toStringUnknown(input);
  } finally {
    seen.delete(input);
  }
};

const jsonSafeValue = (input: unknown): JsonValue =>
  toJsonValue(Inspectable.toJson(input), new WeakSet());

export const atomSnapshotToDto = (atom: AtomSnapshot): AtomSnapshotDto => ({
  ...atomSummaryToDto(atom, atom.states.length > 0),
  value: jsonSafeValue(atom.value),
  valuePreview: Inspectable.toStringUnknown(atom.value),
  ...(atom.source === undefined ? {} : { source: atom.source }),
  keepAlive: atom.keepAlive,
  lazy: atom.lazy,
  ...(atom.idleTTL === undefined ? {} : { idleTTL: atom.idleTTL }),
  subscriberCount: atom.subscriberCount,
  dependencies: atom.dependencies.map(({ id, name }) => ({ id, name })),
  dependents: atom.dependents.map(({ id, name }) => ({ id, name })),
  states: atom.states.map(({ description, id, label }) => ({
    id,
    label,
    ...(description === undefined ? {} : { description }),
  })),
  ...(atom.activeStateId === undefined ? {} : { activeStateId: atom.activeStateId }),
});
