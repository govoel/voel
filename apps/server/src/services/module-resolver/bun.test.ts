/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Schema } from 'effect';

import { BunModuleResolverLayer } from '#src/services/module-resolver/bun.ts';
import { ModuleResolver } from '#src/services/module-resolver/index.ts';

it.effect('resolves package exports from the requested directory without evaluating modules', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const resolver = yield* ModuleResolver;

    for (const entry of ['first.mjs', 'second.mjs']) {
      const directory = yield* fs.makeTempDirectoryScoped();
      const packageDirectory = `${directory}/node_modules/fixture`;
      yield* fs.makeDirectory(packageDirectory, { recursive: true });
      yield* fs.writeFileString(
        `${packageDirectory}/package.json`,
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Json))({
          name: 'fixture',
          exports: { './entry': `./${entry}` },
        })
      );
      yield* fs.writeFileString(
        `${packageDirectory}/${entry}`,
        'throw new Error("Resolution must not evaluate this module");'
      );

      const resolved = yield* resolver.resolve({ specifier: 'fixture/entry', directory });
      expect(yield* fs.realPath(resolved)).toBe(yield* fs.realPath(`${packageDirectory}/${entry}`));
    }
  }).pipe(Effect.scoped, Effect.provide([BunFileSystem.layer, BunModuleResolverLayer]))
);

it.effect('returns typed resolution failures with their request and original cause', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const resolver = yield* ModuleResolver;
    const directory = yield* fs.makeTempDirectoryScoped();
    const request = { specifier: './missing.mjs', directory };
    const error = yield* resolver.resolve(request).pipe(Effect.flip);

    expect(error).toMatchObject({ _tag: 'ModuleResolutionError', ...request });
    expect(error.cause).toBeInstanceOf(Error);
  }).pipe(Effect.scoped, Effect.provide([BunFileSystem.layer, BunModuleResolverLayer]))
);
