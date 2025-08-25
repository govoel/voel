import { Path } from '@effect/platform';
import { Layer, LogLevel, Logger, ManagedRuntime } from 'effect';

import { Audible } from '@/router/v1/library/audible';
import { FsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';

import { env } from '@/env';

/**
 * Maps pino log levels to Effect log levels
 */
const mapLogLevel = (pinoLevel: string): LogLevel.LogLevel => {
  switch (pinoLevel) {
    case 'fatal':
      return LogLevel.Fatal;
    case 'error':
      return LogLevel.Error;
    case 'warn':
      return LogLevel.Warning;
    case 'info':
      return LogLevel.Info;
    case 'debug':
      return LogLevel.Debug;
    case 'trace':
      return LogLevel.Trace;
    case 'silent':
      return LogLevel.None;
    default:
      return LogLevel.Info; // Default fallback
  }
};

const effectLogLevel = mapLogLevel(env.LOG_LEVEL);

const appLayer = Layer.mergeAll(
  Audible.Default,
  FsExtended.Default,
  Path.layer,
  Hash.Default,
  Logger.minimumLogLevel(effectLogLevel)
);

export const AppRuntime = ManagedRuntime.make(appLayer);
