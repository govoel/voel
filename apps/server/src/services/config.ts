import { Config, ConfigProvider, Context, Effect, Layer } from 'effect';

export class ApiConfig extends Context.Service<ApiConfig>()(
  '@repo/server/services/config/ApiConfig',
  {
    make: Effect.gen(function* () {
      const auth = yield* Config.all({ secret: Config.redacted('AUTH_SECRET') });
      const server = yield* Config.all({
        port: Config.port('PORT').pipe(Config.withDefault(8080)),
      });
      const db = yield* Config.all({
        filename: Config.string('DB_FILENAME').pipe(Config.withDefault('database.sqlite')),
      });

      return { auth, server, db };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );
}
