import { Config, ConfigProvider, Context, Effect, Layer, Schema } from 'effect';

const AppConfigSchema = Schema.Struct({
  DB_FILENAME: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed('voel.sqlite'))),
});

export class AppConfig extends Context.Service<AppConfig>()('voel/services/config/AppConfig', {
  make: Effect.gen(function* () {
    const config = yield* Config.schema(AppConfigSchema);
    return { db: { filename: config.DB_FILENAME } };
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (config?: Partial<(typeof AppConfigSchema)['Encoded']>) =>
    Layer.effect(this, this.make).pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DB_FILENAME: ':memory:',
            ...config,
          } satisfies (typeof AppConfigSchema)['Encoded'])
        )
      )
    );
}
