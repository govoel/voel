import { Config, ConfigProvider, Context, Effect, Layer, Schema } from 'effect';

const ApiConfigSchema = Schema.Struct({
  DB_FILENAME: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed('voel.sqlite'))),
});

export class ApiConfig extends Context.Service<ApiConfig>()('voel/services/config/ApiConfig', {
  make: Effect.gen(function* () {
    const config = yield* Config.schema(ApiConfigSchema);
    return { db: { filename: config.DB_FILENAME } };
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (config?: Partial<(typeof ApiConfigSchema)['Encoded']>) =>
    Layer.effect(this, this.make).pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DB_FILENAME: ':memory:',
            ...config,
          } satisfies (typeof ApiConfigSchema)['Encoded'])
        )
      )
    );
}
