import { Effect, Match, Option, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  ActivateState,
  AtomDevTools,
  AtomId,
  AtomNotFound,
  ClearAllStates,
  ClearState,
  Refresh,
  markInternal,
} from '@repo/atom-devtools-core';

import type { ListAtomsArgs } from '#src/shared/agent-tools.ts';
import type { Mutation } from '#src/shared/protocol.ts';
import { AtomSnapshotDto, AtomSummaryDto } from '#src/shared/transport.ts';

const runtime = markInternal(Atom.runtime(AtomDevTools.layer));

export const catalogAtom = markInternal(
  runtime.atom(
    Stream.unwrap(AtomDevTools.pipe(Effect.map(({ catalog }) => catalog))).pipe(
      Stream.map((summaries) => summaries.map((summary) => AtomSummaryDto.fromSummary(summary)))
    )
  )
);

const snapshotEffect = Effect.fn('AtomDevToolsReactive.snapshot')(function* (atomId: string) {
  const service = yield* AtomDevTools;
  const id = AtomId.make(atomId);
  const snapshot = yield* service.watch(id).pipe(Stream.runHead);
  return yield* Option.match(snapshot, {
    onNone: () => Effect.fail(new AtomNotFound({ id })),
    onSome: (atom) => Effect.succeed(AtomSnapshotDto.fromSnapshot(atom)),
  });
});

export const lookupSnapshotAtom = markInternal(runtime.fn<string>()(snapshotEffect));

export const observeSnapshotAtom = markInternal(
  runtime.fn<string>()((atomId) =>
    Stream.unwrap(
      AtomDevTools.pipe(Effect.map((service) => service.watch(AtomId.make(atomId))))
    ).pipe(Stream.map((snapshot) => AtomSnapshotDto.fromSnapshot(snapshot)))
  )
);

const toCommand = Match.typeTags<Mutation>()({
  ActivateState: (mutation) =>
    new ActivateState({ atomId: AtomId.make(mutation.atomId), stateId: mutation.stateId }),
  ClearAllStates: () => new ClearAllStates(),
  ClearState: (mutation) => new ClearState({ atomId: AtomId.make(mutation.atomId) }),
  RefreshAtom: (mutation) => new Refresh({ atomId: AtomId.make(mutation.atomId) }),
});

export const executeMutationAtom = markInternal(
  runtime.fn<Mutation>()(
    Effect.fn('AtomDevToolsReactive.executeMutation')(function* (mutation) {
      const service = yield* AtomDevTools;
      yield* service.execute(toCommand(mutation));
    })
  )
);

export const listAtomsAtom = markInternal(
  Atom.fn<ListAtomsArgs>()(
    Effect.fn('AtomDevToolsReactive.listAtoms')(function* (args, get) {
      const catalog = yield* get.result(catalogAtom);
      const query = args.query?.trim().toLocaleLowerCase();
      const filtered = catalog
        .filter(
          (atom) =>
            (query === void 0 ||
              atom.name.toLocaleLowerCase().includes(query) ||
              atom.id.toLocaleLowerCase().includes(query)) &&
            (args.writable === void 0 || atom.writable === args.writable) &&
            (args.overridden === void 0 || atom.overridden === args.overridden) &&
            (args.stateCapable === void 0 || atom.stateCapable === args.stateCapable)
        )
        .toSorted((left, right) =>
          left.name === right.name
            ? left.id.localeCompare(right.id)
            : left.name.localeCompare(right.name)
        );
      const offset = args.cursor ?? 0;
      const items = filtered.slice(offset, offset + args.limit);
      const nextOffset = offset + items.length;
      return {
        items,
        total: filtered.length,
        ...(nextOffset < filtered.length ? { nextCursor: String(nextOffset) } : {}),
      };
    })
  )
);
