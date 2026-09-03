import { Config, ConfigProvider, Context, Effect, Layer, Schema } from 'effect';

class AppConfigVariables extends Schema.Class<
  AppConfigVariables,
  { readonly brand: unique symbol }
>('voel/services/config/AppConfigVariables')({
  MAIN_DB_FILENAME: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('main.sqlite'))
  ),
  LIBRARY_DB_FILENAME: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('library.db'))
  ),
}) {}

export class AppConfigError extends Schema.TaggedError<
  AppConfigError,
  { readonly brand: unique symbol }
>('voel/services/config/AppConfigError')('AppConfigError', {}) {}

export class AppConfig extends Context.Service<AppConfig>()('voel/services/config/AppConfig', {
  make: Effect.gen(function* () {
    const config = yield* Config.schema(AppConfigVariables);
    return {
      libraryDb: { filename: config.LIBRARY_DB_FILENAME },
      mainDb: { filename: config.MAIN_DB_FILENAME },
    };
  }).pipe(Effect.catchTags({ ConfigError: () => AppConfigError.make() })),
}) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (config?: Partial<(typeof AppConfigVariables)['Encoded']>) =>
    this.layerNoDeps.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            LIBRARY_DB_FILENAME: ':memory:',
            MAIN_DB_FILENAME: ':memory:',
            ...config,
          } satisfies (typeof AppConfigVariables)['Encoded'])
        )
      )
    );
}
