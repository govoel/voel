import { Config, ConfigProvider, Context, Effect, Layer, Schema } from 'effect';

const ApiConfigSchema = Schema.Struct({
  AUTH_SECRET: Schema.RedactedFromValue(Schema.String),
  PORT: Config.Port.pipe(Schema.withDecodingDefaultType(Effect.succeed(8080))),
  DB_FILENAME: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('database.sqlite'))
  ),
});

export class ApiConfig extends Context.Service<ApiConfig>()(
  '@repo/server/services/config/ApiConfig',
  {
    make: Effect.gen(function* () {
      const config = yield* Config.schema(ApiConfigSchema);
      return {
        auth: { secret: config.AUTH_SECRET },
        server: { port: config.PORT },
        db: { filename: config.DB_FILENAME },
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (config?: Partial<(typeof ApiConfigSchema)['Encoded']>) =>
    Layer.effect(this, this.make).pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            AUTH_SECRET: 'test',
            DB_FILENAME: ':memory:',
            ...config,
          } satisfies (typeof ApiConfigSchema)['Encoded'])
        )
      )
    );
}
