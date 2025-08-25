import { Path } from '@effect/platform';
import { Layer, LogLevel, Logger, ManagedRuntime, Match } from 'effect';

import { Audible } from '@/router/v1/library/audible';
import { FsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';

import { env } from '@/env';

const appLayer = Layer.mergeAll(
  Audible.Default,
  FsExtended.Default,
  Path.layer,
  Hash.Default,
  Logger.minimumLogLevel(
    Match.value(env.LOG_LEVEL).pipe(
      Match.when('fatal', () => LogLevel.Fatal),
      Match.when('error', () => LogLevel.Error),
      Match.when('warn', () => LogLevel.Warning),
      Match.when('info', () => LogLevel.Info),
      Match.when('debug', () => LogLevel.Debug),
      Match.when('trace', () => LogLevel.Trace),
      Match.when('silent', () => LogLevel.None),
      Match.exhaustive
    )
  )
);

export const AppRuntime = ManagedRuntime.make(appLayer);
