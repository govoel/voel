/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Exit } from 'effect';

import { ApiConfig } from '#src/services/config.ts';

it.effect('defaults the server port when it is absent', () =>
  Effect.gen(function* () {
    const config = yield* ApiConfig.make.pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ AUTH_SECRET: 'test' })))
    );

    expect(config.server.port).toBe(8080);
  })
);

it.effect('decodes configured port strings, including the valid boundaries', () =>
  Effect.gen(function* () {
    for (const port of ['1', '3000', '65535']) {
      const config = yield* ApiConfig.make.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ AUTH_SECRET: 'test', PORT: port }))
        )
      );

      expect(config.server.port).toBe(Number(port));
    }
  })
);

it.effect('rejects invalid ports instead of applying the default', () =>
  Effect.gen(function* () {
    for (const port of ['0', '65536', '1.5', 'invalid']) {
      const exit = yield* ApiConfig.make.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ AUTH_SECRET: 'test', PORT: port }))
        ),
        Effect.exit
      );

      expect(Exit.isFailure(exit)).toBe(true);
    }
  })
);
