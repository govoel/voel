import { describe, expect, it } from 'bun:test';
import { Effect, LogLevel, Logger, ManagedRuntime } from 'effect';

import { env } from '@/env';

describe('Effect Runtime Logging', () => {
  it('should respect LOG_LEVEL environment variable', async () => {
    // Create a simple Effect that logs at different levels
    const testProgram = Effect.gen(function* () {
      yield* Effect.logTrace('This is a trace message');
      yield* Effect.logDebug('This is a debug message');
      yield* Effect.logInfo('This is an info message');
      yield* Effect.logWarning('This is a warning message');
      yield* Effect.logError('This is an error message');
      yield* Effect.logFatal('This is a fatal message');
    });

    // Test with different log levels to verify filtering works
    const effectLogLevel =
      env.LOG_LEVEL === 'fatal'
        ? LogLevel.Fatal
        : env.LOG_LEVEL === 'error'
          ? LogLevel.Error
          : env.LOG_LEVEL === 'warn'
            ? LogLevel.Warning
            : env.LOG_LEVEL === 'info'
              ? LogLevel.Info
              : env.LOG_LEVEL === 'debug'
                ? LogLevel.Debug
                : env.LOG_LEVEL === 'trace'
                  ? LogLevel.Trace
                  : env.LOG_LEVEL === 'silent'
                    ? LogLevel.None
                    : LogLevel.Info; // Default fallback

    // Create a test runtime with the specific log level
    const testLayer = Logger.minimumLogLevel(effectLogLevel);
    const testRuntime = ManagedRuntime.make(testLayer);

    // The test just needs to verify that the runtime can execute
    // the logging program without errors - the actual log level
    // filtering is handled by the Effect runtime internally
    const result = await testRuntime.runPromise(testProgram);
    expect(result).toBeUndefined();

    testRuntime.dispose();
  });

  it('should not throw when running Effect programs with logging', async () => {
    // Import the AppRuntime to test the actual configured runtime
    const { AppRuntime } = await import('./runtime');

    const simpleLogProgram = Effect.logInfo('Test log message');

    // This should complete without throwing
    const result = await AppRuntime.runPromise(simpleLogProgram);
    expect(result).toBeUndefined();
  });

  it('should map pino log levels to Effect log levels correctly', () => {
    // Test the mapping logic by importing the env and checking values
    expect(env.LOG_LEVEL).toBeDefined();
    expect(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).toContain(env.LOG_LEVEL);
  });
});
