import { Inspectable, Schema } from 'effect';

import type { AtomSnapshot, AtomSummary } from '@repo/atom-devtools-core';

const TypeId = '@repo/atom-devtools-plugin/Transport' as const;

export class AtomLinkDto extends Schema.Class<AtomLinkDto, { readonly brand: unique symbol }>(
  `${TypeId}/AtomLinkDto`
)({
  id: Schema.String,
  name: Schema.String,
}) {}

export class AtomSummaryDto extends Schema.Class<AtomSummaryDto, { readonly brand: unique symbol }>(
  `${TypeId}/AtomSummaryDto`
)({
  id: Schema.String,
  name: Schema.String,
  writable: Schema.Boolean,
  overridden: Schema.Boolean,
  stateCapable: Schema.Boolean,
}) {
  public static readonly fromSummary = (atom: AtomSummary, stateCapable: boolean): AtomSummaryDto =>
    new this({
      id: atom.id,
      name: atom.name,
      writable: atom.writable,
      overridden: atom.overridden,
      stateCapable,
    });
}

class AtomStateDto extends Schema.Class<AtomStateDto, { readonly brand: unique symbol }>(
  `${TypeId}/AtomStateDto`
)({
  id: Schema.String,
  label: Schema.String,
  description: Schema.optional(Schema.String),
}) {}

export class AtomSnapshotDto extends AtomSummaryDto.extend<
  AtomSnapshotDto,
  Record<never, never>,
  { readonly atomSnapshotBrand: unique symbol }
>(`${TypeId}/AtomSnapshotDto`)({
  value: Schema.String,
  source: Schema.optional(Schema.String),
  keepAlive: Schema.Boolean,
  lazy: Schema.Boolean,
  idleTTL: Schema.optional(Schema.Number),
  subscriberCount: Schema.Number,
  dependencies: Schema.Array(AtomLinkDto),
  dependents: Schema.Array(AtomLinkDto),
  states: Schema.Array(AtomStateDto),
  activeStateId: Schema.optional(Schema.String),
}) {
  public static readonly fromSnapshot = (atom: AtomSnapshot): AtomSnapshotDto =>
    new this({
      id: atom.id,
      name: atom.name,
      writable: atom.writable,
      overridden: atom.overridden,
      stateCapable: atom.states.length > 0,
      value: Inspectable.toStringUnknown(atom.value),
      ...(atom.source === void 0 ? {} : { source: atom.source }),
      keepAlive: atom.keepAlive,
      lazy: atom.lazy,
      ...(atom.idleTTL === void 0 ? {} : { idleTTL: atom.idleTTL }),
      subscriberCount: atom.subscriberCount,
      dependencies: atom.dependencies.map(({ id, name }) => new AtomLinkDto({ id, name })),
      dependents: atom.dependents.map(({ id, name }) => new AtomLinkDto({ id, name })),
      states: atom.states.map(
        ({ description, id, label }) =>
          new AtomStateDto({
            id,
            label,
            ...(description === void 0 ? {} : { description }),
          })
      ),
      ...(atom.activeStateId === void 0 ? {} : { activeStateId: atom.activeStateId }),
    });
}
