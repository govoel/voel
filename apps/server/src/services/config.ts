import { Config, ConfigProvider, Context, Effect, Layer, Schema } from 'effect';

class ApiConfigVariables extends Schema.Class<
  ApiConfigVariables,
  { readonly brand: unique symbol }
>('@repo/server/services/config/ApiConfigVariables')({
  AUTH_SECRET: Schema.RedactedFromValue(Schema.String),
  PORT: Config.Port.pipe(Schema.withDecodingDefaultType(Effect.succeed(8080))),
  DB_FILENAME: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('database.sqlite'))
  ),
}) {}

export class ApiConfig extends Context.Service<ApiConfig>()(
  '@repo/server/services/config/ApiConfig',
  {
    make: Effect.gen(function* () {
      const config = yield* Config.schema(ApiConfigVariables);
      return {
        auth: { secret: config.AUTH_SECRET },
        server: { port: config.PORT },
        db: { filename: config.DB_FILENAME },
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (config?: Partial<(typeof ApiConfigVariables)['Encoded']>) =>
    this.layerNoDeps.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            AUTH_SECRET: 'test',
            DB_FILENAME: ':memory:',
            ...config,
          } satisfies (typeof ApiConfigVariables)['Encoded'])
        )
      )
    );
}
