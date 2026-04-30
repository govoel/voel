import { Effect } from 'effect';

const program = Effect.log('Hello world');

await Effect.runPromise(program);
