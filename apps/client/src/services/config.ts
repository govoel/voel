import { Config, ConfigProvider, Context, Effect, Layer, Schema } from 'effect';

class AppConfigVariables extends Schema.Class<
  AppConfigVariables,
  { readonly brand: unique symbol }
>('voel/services/config/AppConfigVariables')({
  MAIN_DB_FILENAME: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('main.sqlite'))
  ),
}) {}

export class AppConfigError extends Schema.TaggedErrorClass<
  AppConfigError,
  { readonly brand: unique symbol }
>('voel/services/config/AppConfigError')('AppConfigError', {}) {}

export class AppConfig extends Context.Service<AppConfig>()('voel/services/config/AppConfig', {
  make: Effect.gen(function* () {
    const config = yield* Config.schema(AppConfigVariables);
    return { mainDb: { filename: config.MAIN_DB_FILENAME } };
  }).pipe(Effect.catchTags({ ConfigError: () => new AppConfigError() })),
}) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (config?: Partial<(typeof AppConfigVariables)['Encoded']>) =>
    Layer.effect(this, this.make).pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            MAIN_DB_FILENAME: ':memory:',
            ...config,
          } satisfies (typeof AppConfigVariables)['Encoded'])
        )
      )
    );
}
