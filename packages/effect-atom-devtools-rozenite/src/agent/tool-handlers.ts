import type { InferAgentToolArgs } from '@rozenite/agent-shared';
import { Effect, Option, Schema, Stream } from 'effect';
import type { ManagedRuntime } from 'effect';

import { AtomDevTools, AtomId } from '@repo/effect-atom-devtools-core/atom-dev-tools';

import type { atomDevToolsToolDefinitions } from '#src/shared/agent-tools.ts';

export type AtomDevToolsRuntime = ManagedRuntime.ManagedRuntime<AtomDevTools, never>;
type ToolArgs<Tool extends keyof typeof atomDevToolsToolDefinitions> = InferAgentToolArgs<
  (typeof atomDevToolsToolDefinitions)[Tool]
>;

const AtomInput = Schema.Struct({
  atomId: AtomId,
});

const ActivatePredefinedStateInput = Schema.Struct({
  atomId: AtomId,
  stateId: Schema.String,
});

const decodeAtomInput = Schema.decodeUnknownEffect(AtomInput);
const decodeActivatePredefinedStateInput = Schema.decodeUnknownEffect(ActivatePredefinedStateInput);

const getCatalog = Effect.gen(function* () {
  const atomDevTools = yield* AtomDevTools;
  return yield* atomDevTools.catalog.pipe(Stream.runHead, Effect.map(Option.getOrThrow));
});

const getAtomSnapshot = Effect.fn('getAtomSnapshot')(function* (atomId: AtomId) {
  const atomDevTools = yield* AtomDevTools;
  return yield* atomDevTools.watch(atomId).pipe(Stream.runHead, Effect.map(Option.getOrThrow));
});

export const makeAtomDevToolsAgentHandlers = (runtime: AtomDevToolsRuntime) => ({
  listAtoms: async () => runtime.runPromise(getCatalog),
  getAtomDetails: async (input: ToolArgs<'getAtomDetails'>) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const { atomId } = yield* decodeAtomInput(input);
        return yield* getAtomSnapshot(atomId);
      })
    ),
  activatePredefinedState: async (input: ToolArgs<'activatePredefinedState'>) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const { atomId, stateId } = yield* decodeActivatePredefinedStateInput(input);
        const atomDevTools = yield* AtomDevTools;
        yield* atomDevTools.activatePredefinedState(atomId, stateId);
        return {
          activated: true,
          atom: yield* getAtomSnapshot(atomId),
        } as const;
      })
    ),
  clearPredefinedState: async (input: ToolArgs<'clearPredefinedState'>) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const { atomId } = yield* decodeAtomInput(input);
        const atomDevTools = yield* AtomDevTools;
        yield* atomDevTools.clearPredefinedState(atomId);
        return {
          cleared: true,
          atom: yield* getAtomSnapshot(atomId),
        } as const;
      })
    ),
  clearAllPredefinedStates: async () =>
    runtime.runPromise(
      Effect.gen(function* () {
        const atomDevTools = yield* AtomDevTools;
        yield* atomDevTools.clearAllPredefinedStates();
        return { cleared: true } as const;
      })
    ),
  refreshAtom: async (input: ToolArgs<'refreshAtom'>) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const { atomId } = yield* decodeAtomInput(input);
        const atomDevTools = yield* AtomDevTools;
        yield* atomDevTools.refresh(atomId);
        return {
          refreshed: true,
          atom: yield* getAtomSnapshot(atomId),
        } as const;
      })
    ),
});
