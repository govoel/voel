import { Config, ConfigProvider, Context, Effect, Layer, Schema } from 'effect';

class AppConfigSchema extends Schema.Class<AppConfigSchema, { readonly brand: unique symbol }>(
  'voel/services/config/AppConfigSchema'
)({
  MAINDB_FILENAME: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('main.sqlite'))
  ),
}) {}

export class AppConfigError extends Schema.TaggedErrorClass<
  AppConfigError,
  { readonly brand: unique symbol }
>()('voel/services/config/AppConfigError', {}) {}

export class AppConfig extends Context.Service<AppConfig>()('voel/services/config/AppConfig', {
  make: Effect.gen(function* () {
    const config = yield* Config.schema(AppConfigSchema);
    return { mainDb: { filename: config.MAINDB_FILENAME } };
  }).pipe(Effect.catchTags({ ConfigError: () => new AppConfigError() })),
}) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (config?: Partial<(typeof AppConfigSchema)['Encoded']>) =>
    Layer.effect(this, this.make).pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            MAINDB_FILENAME: ':memory:',
            ...config,
          } satisfies (typeof AppConfigSchema)['Encoded'])
        )
      )
    );
}
