import { Data, Effect } from 'effect';
import TurndownService from 'turndown';

export class TurndownError extends Data.TaggedError('TurndownError')<{
  message: string;
}> {}

export class Turndown extends Effect.Service<Turndown>()('Turndown', {
  effect: Effect.gen(function* () {
    // Turndown source doesn't seem to throw when creating a new instance
    const turndownService = yield* Effect.succeed(new TurndownService());

    return {
      toMarkdown: (html: string) =>
        Effect.try({
          try: () => turndownService.turndown(html),
          catch: (error) =>
            new TurndownError({ message: error instanceof Error ? error.message : String(error) }),
        }),
    };
  }),

  dependencies: [],
}) {}
