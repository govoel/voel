import { BunFileSystem } from '@effect/platform-bun';
import { Config, ConfigProvider, Context, Effect, FileSystem, Layer, Schema } from 'effect';

class ApiConfigSchema extends Schema.Class<ApiConfigSchema, { readonly brand: unique symbol }>(
  '@repo/server/services/config/ApiConfigSchema'
)({
  AUTH_SECRET: Schema.RedactedFromValue(Schema.String),
  PORT: Config.Port.pipe(Schema.withDecodingDefaultType(Effect.succeed(8080))),
  AUTH_DB_FILENAME: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed('auth.db'))),
  LIBRARY_DB_FILENAME: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('library.db'))
  ),
}) {}

export class ApiConfig extends Context.Service<ApiConfig>()(
  '@repo/server/services/config/ApiConfig',
  {
    make: Effect.gen(function* () {
      const config = yield* Config.schema(ApiConfigSchema);
      return {
        auth: { secret: config.AUTH_SECRET },
        server: { port: config.PORT },
        db: {
          authFilename: config.AUTH_DB_FILENAME,
          libraryFilename: config.LIBRARY_DB_FILENAME,
        },
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );

  public static readonly layerTest = (
    config?: Partial<
      Omit<(typeof ApiConfigSchema)['Encoded'], 'AUTH_DB_FILENAME' | 'LIBRARY_DB_FILENAME'>
    >
  ) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'voel-server-test-' });

        return ApiConfig.layerNoDeps.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                AUTH_SECRET: 'test',
                ...config,
                AUTH_DB_FILENAME: `${directory}/auth.db`,
                LIBRARY_DB_FILENAME: `${directory}/library.db`,
              } satisfies (typeof ApiConfigSchema)['Encoded'])
            )
          )
        );
      })
    ).pipe(Layer.provide(BunFileSystem.layer));
}
