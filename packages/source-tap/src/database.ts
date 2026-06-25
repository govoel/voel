import BunSqliteDatabase from 'bun:sqlite';

import { Effect } from 'effect';
import type { Scope } from 'effect';

import { Kysely, ParseJSONResultsPlugin, makeFromKysely } from '@repo/effect-kysely';
import type { EffectKysely } from '@repo/effect-kysely';
import { BunSqliteDialect } from '@repo/effect-kysely/dialect.ts';

import { SourceTapDialect } from '#src/dialect.ts';
import { SourceTap } from '#src/source-tap.ts';

interface CreateDatabaseOptions<DB> {
  filename: string;
  trackTables?: ReadonlySet<keyof DB>;
  enableLogging?: boolean;
}

interface CreateTrackedDatabaseOptions<DB> extends CreateDatabaseOptions<DB> {
  trackTables: ReadonlySet<keyof DB>;
}

interface CreatedDatabase<DB> {
  db: EffectKysely<DB>;
  sourceTap: SourceTap<DB> | undefined;
  kysely: Kysely<DB>;
}

interface CreatedTrackedDatabase<DB> extends CreatedDatabase<DB> {
  sourceTap: SourceTap<DB>;
}

export function createDatabase<DB>(
  options: CreateTrackedDatabaseOptions<DB>
): Effect.Effect<CreatedTrackedDatabase<DB>, never, Scope.Scope>;
export function createDatabase<DB>(
  options: CreateDatabaseOptions<DB>
): Effect.Effect<CreatedDatabase<DB>, never, Scope.Scope>;
export function createDatabase<DB>({
  filename,
  trackTables,
  enableLogging,
}: CreateDatabaseOptions<DB>) {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      const parseJsonResultsPlugin = new ParseJSONResultsPlugin();
      const sourceTap = trackTables ? yield* SourceTap.make<DB>({ trackTables }) : void 0;
      const kysely = new Kysely<DB>({
        dialect:
          trackTables !== void 0
            ? new SourceTapDialect({
                database: new BunSqliteDatabase(filename),
                onBeginTransaction: () => sourceTap?.beginTransaction(),
                onCommitTransaction: () => sourceTap?.commitTransaction(),
                onRollbackTransaction: () => sourceTap?.rollbackTransaction(),
              })
            : new BunSqliteDialect({ database: new BunSqliteDatabase(filename) }),
        plugins:
          sourceTap !== void 0 ? [sourceTap, parseJsonResultsPlugin] : [parseJsonResultsPlugin],
        ...(enableLogging === true
          ? {
              log: (event) => {
                if (event.level === 'query') {
                  // @effect-diagnostics-next-line globalConsole:off
                  // oxlint-disable-next-line eslint/no-console
                  console.log(
                    `${sourceTap ? '☀️' : '🍦'} dbQuery(${event.queryDurationMillis.toFixed(2)}ms) => ${event.query.sql}`
                  );
                } else {
                  // @effect-diagnostics-next-line globalConsole:off
                  // oxlint-disable-next-line eslint/no-console
                  console.log(
                    `${sourceTap ? '☀️' : '🍦'} dbError(${event.queryDurationMillis.toFixed(2)}ms) => ${event.query.sql}`
                  );
                }
              },
            }
          : {}),
      });

      return { db: makeFromKysely(kysely), sourceTap, kysely };
    }),
    ({ db }) => Effect.promise(async () => db.destroy())
  );
}
