import { Effect, Match, Option, Predicate, Schema, Stream } from 'effect';

import {
  ActivateState,
  AtomId,
  AtomNotFound,
  ClearAllStates,
  ClearState,
  Refresh,
  StateNotFound,
} from '@repo/atom-devtools-core';
import type { AtomDevTools, AtomSummary } from '@repo/atom-devtools-core';

import { TransportError } from '#src/shared/protocol.ts';
import type { Mutation } from '#src/shared/protocol.ts';
import { AtomSummaryDto } from '#src/shared/transport.ts';

export type AtomDevToolsService = AtomDevTools['Service'];

export class AtomDevToolsNotReady extends Schema.TaggedErrorClass<AtomDevToolsNotReady>()(
  'AtomDevToolsNotReady',
  {}
) {}

export const getSnapshot = Effect.fnUntraced(function* (
  service: AtomDevToolsService,
  atomId: string
) {
  const id = AtomId.make(atomId);
  const snapshot = yield* service.watch(id).pipe(Stream.runHead);
  return yield* Option.match(snapshot, {
    onNone: () => Effect.fail(new AtomNotFound({ id })),
    onSome: Effect.succeed,
  });
});

export const enrichCatalog = Effect.fnUntraced(function* (
  service: AtomDevToolsService,
  summaries: readonly AtomSummary[]
) {
  return yield* Effect.forEach(
    summaries,
    (summary) =>
      getSnapshot(service, summary.id).pipe(
        Effect.map((snapshot) => AtomSummaryDto.fromSummary(summary, snapshot.states.length > 0)),
        Effect.catchTag('AtomNotFound', () =>
          Effect.succeed(AtomSummaryDto.fromSummary(summary, false))
        )
      ),
    { concurrency: 'unbounded' }
  );
});

const toCommand = Match.typeTags<Mutation>()({
  ActivateState: (mutation) =>
    new ActivateState({
      atomId: AtomId.make(mutation.atomId),
      stateId: mutation.stateId,
    }),
  ClearAllStates: () => new ClearAllStates(),
  ClearState: (mutation) => new ClearState({ atomId: AtomId.make(mutation.atomId) }),
  RefreshAtom: (mutation) => new Refresh({ atomId: AtomId.make(mutation.atomId) }),
});

export const executeMutation = (service: AtomDevToolsService, mutation: Mutation) =>
  service.execute(toCommand(mutation));

const errorMessage = (error: unknown): string => {
  if (Schema.is(AtomNotFound)(error)) {
    return `Atom "${error.id}" was not found. Call list-atoms again to get current IDs.`;
  }
  if (Schema.is(StateNotFound)(error)) {
    return `State "${error.stateId}" was not found on atom "${error.atomId}". Call get-atom to list available states.`;
  }
  if (Schema.is(AtomDevToolsNotReady)(error)) {
    return 'Atom DevTools is still starting. Retry shortly.';
  }
  if (Predicate.isError(error)) {
    return error.message;
  }
  return String(error);
};

export const transportError = (error: unknown): TransportError => {
  if (Schema.is(AtomNotFound)(error)) {
    return new TransportError({ code: 'atom-not-found', message: errorMessage(error) });
  }
  if (Schema.is(StateNotFound)(error)) {
    return new TransportError({ code: 'state-not-found', message: errorMessage(error) });
  }
  if (Schema.is(AtomDevToolsNotReady)(error)) {
    return new TransportError({ code: 'not-ready', message: errorMessage(error) });
  }
  return new TransportError({ code: 'unknown', message: errorMessage(error) });
};

export const requireService = (
  service: AtomDevToolsService | undefined
): Effect.Effect<AtomDevToolsService, AtomDevToolsNotReady> =>
  service === void 0 ? Effect.fail(new AtomDevToolsNotReady()) : Effect.succeed(service);

export const runTool = async <A, B, DecodeError, E>(
  decode: (input: unknown) => Effect.Effect<A, DecodeError>,
  input: unknown,
  handler: (args: A) => Effect.Effect<B, E>
): Promise<B> => {
  try {
    return await Effect.runPromise(decode(input).pipe(Effect.flatMap(handler)));
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
};
