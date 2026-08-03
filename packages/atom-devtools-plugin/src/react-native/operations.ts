import { Effect, Predicate, Schema } from 'effect';

import { AtomNotFound, StateNotFound } from '@repo/atom-devtools-core';

import { TransportError } from '#src/shared/protocol.ts';

export class AtomDevToolsNotReady extends Schema.TaggedErrorClass<AtomDevToolsNotReady>()(
  'AtomDevToolsNotReady',
  {}
) {}

export const errorMessage = (error: unknown): string => {
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

export const runTool = async <A, B, DecodeError>(
  decode: (input: unknown) => Effect.Effect<A, DecodeError>,
  input: unknown,
  handler: (args: A) => Promise<B>
): Promise<B> => {
  try {
    const args = await Effect.runPromise(decode(input));
    return await handler(args);
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
};
