import { Context, Data, Effect, Layer, LayerMap } from 'effect';

import { Kysely, ParseJSONResultsPlugin, makeFromKysely, sql } from '@repo/effect-kysely';
import type { Dialect, EffectKysely, Selectable } from '@repo/effect-kysely';

import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { runAccountDatabaseMigrations } from '#src/services/database/account/migrations.ts';
import type { AccountDatabaseTables } from '#src/services/database/account/schema.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';

export class AccountDatabaseKey extends Data.Class<
  Pick<Selectable<AccountTable>, 'serverUrl' | 'userId'>
> {}

export class AccountDatabase extends Context.Service<
  AccountDatabase,
  EffectKysely<AccountDatabaseTables>
>()('voel/services/database/account/AccountDatabase') {
  public static readonly layer = ({ dialect }: { readonly dialect: Dialect }) =>
    Layer.effect(
      this,
      Effect.acquireRelease(
        Effect.gen(function* () {
          const kysely = new Kysely<AccountDatabaseTables>({
            dialect,
            plugins: [new ParseJSONResultsPlugin()],
          });
          const db = makeFromKysely(kysely);

          yield* db.executeRaw(sql`PRAGMA journal_mode = WAL`);
          yield* db.executeRaw(sql`PRAGMA synchronous = NORMAL`);
          yield* runAccountDatabaseMigrations(kysely);

          return db;
        }),
        (db) => Effect.promise(async () => db.destroy())
      )
    );
}

export const makeAccountDatabaseFilename = Effect.fnUntraced(function* (key: AccountDatabaseKey) {
  const xxHash = yield* XxHash;
  return `${yield* xxHash.hash128(`voel::database::${key.serverUrl}::${key.userId}`)}.sqlite`;
});

export class AccountDatabaseMap extends LayerMap.Service<AccountDatabaseMap>()(
  'voel/services/database/account/AccountDatabaseMap',
  {
    lookup: (key: AccountDatabaseKey) =>
      Layer.unwrap(
        Effect.gen(function* () {
          const filename = yield* makeAccountDatabaseFilename(key);
          const { OpSqliteDialect } = yield* Effect.promise(
            async () => import('#src/services/database/dialect.ts')
          );
          return AccountDatabase.layer({ dialect: new OpSqliteDialect({ filename }) });
        })
      ),
  }
) {}

export const acquireAccountDatabase = (key: AccountDatabaseKey) =>
  AccountDatabaseMap.contextEffect(key).pipe(Effect.map(Context.get(AccountDatabase)));
