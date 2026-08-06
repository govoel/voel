import { Effect, Predicate, Schema } from 'effect';

import { AtomNotFound, StateNotFound } from '@repo/atom-devtools-core';

export const errorMessage = (error: unknown): string => {
  if (Schema.is(AtomNotFound)(error)) {
    return `Atom "${error.id}" was not found. Call list-atoms again to get current IDs.`;
  }
  if (Schema.is(StateNotFound)(error)) {
    return `State "${error.stateId}" was not found on atom "${error.atomId}". Call get-atom to list available states.`;
  }
  if (Predicate.isError(error)) {
    return error.message;
  }
  return String(error);
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
