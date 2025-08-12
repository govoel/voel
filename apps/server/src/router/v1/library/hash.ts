import { Effect } from 'effect';

export class Hash extends Effect.Service<Hash>()('Hash', {
  succeed: {
    rapidhash: ({
      data,
      seed,
    }: {
      data: Parameters<typeof Bun.hash.rapidhash>[0];
      seed?: Parameters<typeof Bun.hash.rapidhash>[1];
    }) =>
      Effect.sync(() =>
        // `toString()` because `safeIntegers` is not enabled for the "bun:sqlite" connection
        // since that turns *all* integers into bigints, which breaks zod responses since
        // we don't have a transformer. note that if `safeIntegers` were enabled in the future,
        // the client would need to behave the same way "bun:sqlite" does since we sync to the client
        Bun.hash.rapidhash(data, seed).toString(16)
      ),
  },

  dependencies: [],
}) {}
