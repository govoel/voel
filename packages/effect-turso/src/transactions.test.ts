/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import {
  Array,
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Scope,
  String,
  pipe,
} from 'effect';
import { Reactivity } from 'effect/reactivity';
import { SqlError } from 'effect/sql';
import { vi } from 'vitest';

import { TursoClient } from '#src/index.ts';

const TestLayer = Layer.mergeAll(BunFileSystem.layer, Reactivity.layer);

describe('TursoClient pooled transaction recovery', () => {
  const make = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const sql = yield* TursoClient.make({
      filename: `${dir}/transactions.db`,
      minConnections: 1,
      maxConnections: 2,
      onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
    });
    yield* sql`
      create table parent (id integer primary key)
    `;
    yield* sql`
      create table child (
        id integer primary key,
        parent_id integer references parent (id) deferrable initially deferred
      )
    `;
    return sql;
  });

  it.effect(
    'keeps poisoning and recovery local to the failed physical connection',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      const scope = yield* Effect.scope;
      const firstLease = yield* Scope.fork(scope);
      const secondLease = yield* Scope.fork(scope);
      const first = yield* Scope.provide(sql.reserve, firstLease);
      const second = yield* Scope.provide(sql.reserve, secondLease);
      expect(first).not.toBe(second);

      const execute = first.executeUnprepared;
      let failures = 2;
      const cleanupError = SqlError.SqlError.make({
        reason: SqlError.ConnectionError.make({
          cause: new Error('Injected rollback failure'),
          message: 'Injected rollback failure',
        }),
      });
      const firstSpy = vi
        .spyOn(first, 'executeUnprepared')
        .mockImplementation((statement, params, transformRows) => {
          if (statement === 'ROLLBACK' && failures > 0) {
            failures -= 1;
            return Effect.fail(cleanupError);
          }
          return execute(statement, params, transformRows);
        });
      const secondSpy = vi.spyOn(second, 'executeUnprepared');
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          firstSpy.mockRestore();
          secondSpy.mockRestore();
        })
      );

      // Keep the second connection reserved so the transaction must acquire the first.
      yield* Scope.close(firstLease, Exit.void);
      const failed = yield* sql
        .withTransaction(
          sql`
            insert into
              parent
            values
              (1)
          `.pipe(
            Effect.andThen(sql`
              insert into
                child
              values
                (1, 999)
            `)
          )
        )
        .pipe(Effect.exit);
      expect(Exit.isFailure(failed)).toBe(true);
      if (Exit.isFailure(failed)) {
        expect(Cause.hasFails(failed.cause)).toBe(false);
        expect(Cause.hasDies(failed.cause)).toBe(true);
        expect(Cause.pretty(failed.cause)).toContain('Injected rollback failure');
        expect(String.toLowerCase(Cause.pretty(failed.cause))).toContain('foreign key');
      }

      const failedLease = yield* Scope.fork(scope);
      const unavailable = yield* Scope.provide(sql.reserve, failedLease).pipe(Effect.result);
      expect(unavailable).toMatchObject({
        _tag: 'Failure',
        failure: { _tag: 'SqlError', reason: { _tag: 'ConnectionError' } },
      });
      expect(
        Array.filter(firstSpy.mock.calls, ([statement]) => statement === 'ROLLBACK')
      ).toHaveLength(2);

      // The failed acquisition still owns its pool lease until its supplied scope closes.
      // Release only the second connection, forcing a fresh acquisition of the healthy one.
      yield* Scope.close(secondLease, Exit.void);
      const healthyLease = yield* Scope.fork(scope);
      const healthy = yield* Scope.provide(sql.reserve, healthyLease);
      expect(healthy).toBe(second);
      expect(yield* healthy.executeUnprepared('SELECT * FROM parent', [], void 0)).toEqual([]);
      expect(
        Array.filter(secondSpy.mock.calls, ([statement]) => statement === 'ROLLBACK')
      ).toHaveLength(0);
      expect(
        Array.filter(firstSpy.mock.calls, ([statement]) => statement === 'ROLLBACK')
      ).toHaveLength(2);

      yield* Scope.close(failedLease, Exit.void);
      const recoveredLease = yield* Scope.fork(scope);
      const recovered = yield* Scope.provide(sql.reserve, recoveredLease);
      expect(recovered).toBe(first);
      expect(
        Array.filter(firstSpy.mock.calls, ([statement]) => statement === 'ROLLBACK')
      ).toHaveLength(3);
      expect(
        Array.filter(secondSpy.mock.calls, ([statement]) => statement === 'ROLLBACK')
      ).toHaveLength(0);
      expect(yield* recovered.executeUnprepared('SELECT * FROM parent', [], void 0)).toEqual([]);
      expect(yield* recovered.executeUnprepared('SELECT * FROM child', [], void 0)).toEqual([]);
    }, Effect.provide(TestLayer))
  );

  it.effect(
    'serves healthy reads while another connection is held for COMMIT cleanup',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      const scope = yield* Effect.scope;
      const firstLease = yield* Scope.fork(scope);
      const secondLease = yield* Scope.fork(scope);
      const first = yield* Scope.provide(sql.reserve, firstLease);
      const second = yield* Scope.provide(sql.reserve, secondLease);
      expect(first).not.toBe(second);

      const entered = yield* Deferred.make<true>();
      const release = yield* Deferred.make<true>();
      const execute = first.executeUnprepared;
      const spy = vi
        .spyOn(first, 'executeUnprepared')
        .mockImplementation((statement, params, transformRows) =>
          statement === 'ROLLBACK'
            ? Deferred.succeed(entered, true).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.andThen(execute(statement, params, transformRows))
              )
            : execute(statement, params, transformRows)
        );
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          spy.mockRestore();
        })
      );

      yield* Scope.close(firstLease, Exit.void);
      yield* Effect.gen(function* () {
        const transaction = yield* sql
          .withTransaction(sql`
            insert into
              child
            values
              (1, 999)
          `)
          .pipe(Effect.exit, Effect.forkChild);
        yield* Deferred.await(entered);

        yield* Scope.close(secondLease, Exit.void);
        const healthyLease = yield* Scope.fork(scope);
        const healthy = yield* Scope.provide(sql.reserve, healthyLease);
        expect(healthy).toBe(second);
        expect(yield* healthy.executeUnprepared('SELECT * FROM child', [], void 0)).toEqual([]);
        expect(transaction.pollUnsafe()).toBe(void 0);

        // Both pool slots are now occupied. The next reservation must wait for cleanup.
        const waiting = yield* Effect.scoped(sql.reserve).pipe(
          Effect.forkChild({ startImmediately: true })
        );
        expect(waiting.pollUnsafe()).toBe(void 0);

        yield* Deferred.succeed(release, true);
        const failed = yield* Fiber.join(transaction);
        expect(Exit.isFailure(failed)).toBe(true);
        if (Exit.isFailure(failed)) {
          expect(String.toLowerCase(Cause.pretty(failed.cause))).toContain('foreign key');
        }
        expect(yield* Fiber.join(waiting)).toBe(first);
        expect(yield* healthy.executeUnprepared('SELECT * FROM child', [], void 0)).toEqual([]);
      }).pipe(Effect.ensuring(Deferred.succeed(release, true)));
    }, Effect.provide(TestLayer))
  );
});

describe.each(['file-backed', 'in-memory'] as const)('TursoClient transactions (%s)', (storage) => {
  const make = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const sql = yield* TursoClient.make({
      filename: storage === 'in-memory' ? ':memory:' : `${dir}/transactions.db`,
      minConnections: 1,
      maxConnections: 1,
    });
    yield* sql`
      pragma foreign_keys = on
    `;
    yield* sql`
      create table parent (id integer primary key)
    `;
    yield* sql`
      create table child (
        id integer primary key,
        parent_id integer references parent (id) deferrable initially deferred
      )
    `;
    return sql;
  });

  it.effect(
    'rolls back failed COMMIT before ordinary reads and subsequent transactions',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      const failed = yield* sql
        .withTransaction(
          sql`
            insert into
              parent
            values
              (1)
          `.pipe(
            Effect.andThen(sql`
              insert into
                child
              values
                (1, 999)
            `)
          )
        )
        .pipe(Effect.result);
      expect(failed).toMatchObject({
        _tag: 'Failure',
        failure: { _tag: 'SqlError', reason: { _tag: 'ConstraintError' } },
      });
      expect(
        yield* sql`
          select
            *
          from
            parent
        `
      ).toEqual([]);
      expect(
        yield* sql`
          select
            *
          from
            child
        `
      ).toEqual([]);

      // Valid deferred ownership succeeds, including child-first provisioning.
      yield* sql.withTransaction(
        sql`
          insert into
            child
          values
            (2, 2)
        `.pipe(
          Effect.andThen(sql`
            insert into
              parent
            values
              (2)
          `)
        )
      );
      expect(
        yield* sql`
          select
            *
          from
            child
        `
      ).toEqual([{ id: 2, parent_id: 2 }]);
    }, Effect.provide(TestLayer))
  );

  it.effect(
    'rejects a poisoned connection until rollback succeeds without reopening it',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      const connection = yield* Effect.scoped(sql.reserve);
      const execute = connection.executeUnprepared;
      let failures = 2;
      const cleanupError = SqlError.SqlError.make({
        reason: SqlError.ConnectionError.make({
          cause: new Error('Injected rollback failure'),
          message: 'Injected rollback failure',
        }),
      });
      const spy = vi
        .spyOn(connection, 'executeUnprepared')
        .mockImplementation((statement, params, transformRows) => {
          if (statement === 'ROLLBACK' && failures > 0) {
            failures -= 1;
            return Effect.fail(cleanupError);
          }
          return execute(statement, params, transformRows);
        });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          spy.mockRestore();
        })
      );

      const failed = yield* sql
        .withTransaction(
          sql`
            insert into
              parent
            values
              (1)
          `.pipe(
            Effect.andThen(sql`
              insert into
                child
              values
                (1, 999)
            `)
          )
        )
        .pipe(Effect.exit);
      expect(Exit.isFailure(failed)).toBe(true);
      if (Exit.isFailure(failed)) {
        expect(Cause.hasFails(failed.cause)).toBe(false);
        expect(Cause.hasDies(failed.cause)).toBe(true);
        expect(Cause.pretty(failed.cause)).toContain('Injected rollback failure');
        expect(String.toLowerCase(Cause.pretty(failed.cause))).toContain('foreign key');
      }

      const unavailable = yield* sql`
        select
          *
        from
          parent
      `.pipe(Effect.result);
      expect(unavailable).toMatchObject({
        _tag: 'Failure',
        failure: { _tag: 'SqlError', reason: { _tag: 'ConnectionError' } },
      });
      expect(
        yield* sql`
          select
            *
          from
            parent
        `
      ).toEqual([]);
      yield* sql`
        insert into
          parent
        values
          (2)
      `.pipe(sql.withTransaction);
      expect(
        yield* sql`
          select
            *
          from
            parent
        `
      ).toEqual([{ id: 2 }]);
    }, Effect.provide(TestLayer))
  );

  it.effect(
    'preserves the typed SQL error after automatic rollback',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      yield* sql`
        insert into
          parent
        values
          (1)
      `;
      const failed = yield* sql`
        insert or rollback into
          parent
        values
          (1)
      `.pipe(sql.withTransaction, Effect.result);
      expect(failed).toMatchObject({
        _tag: 'Failure',
        failure: { _tag: 'SqlError', reason: { _tag: 'UniqueViolation' } },
      });
    }, Effect.provide(TestLayer))
  );

  it.effect(
    'does not roll back an already-ended transaction after COMMIT fails',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      const connection = yield* Effect.scoped(sql.reserve);
      const execute = connection.executeUnprepared;
      const controls: Array<string> = [];
      const spy = vi
        .spyOn(connection, 'executeUnprepared')
        .mockImplementation((statement, params, transformRows) => {
          controls.push(statement);
          return execute(statement, params, transformRows);
        });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          spy.mockRestore();
        })
      );

      const failed = yield* sql
        .withTransaction(connection.executeUnprepared('ROLLBACK', [], void 0))
        .pipe(Effect.exit);
      expect(Exit.isFailure(failed)).toBe(true);
      // One explicit rollback, not another failed cleanup and extra error.
      expect(Array.filter(controls, (statement) => statement === 'ROLLBACK')).toHaveLength(1);
      yield* sql`
        insert into
          parent
        values
          (1)
      `.pipe(sql.withTransaction);
      expect(
        yield* sql`
          select
            *
          from
            parent
        `
      ).toEqual([{ id: 1 }]);
    }, Effect.provide(TestLayer))
  );

  it.effect(
    'releases nested savepoints after both success and rollback',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      const connection = yield* Effect.scoped(sql.reserve);
      const execute = connection.executeUnprepared;
      const releases: Array<string> = [];
      const spy = vi
        .spyOn(connection, 'executeUnprepared')
        .mockImplementation((statement, params, transformRows) => {
          if (pipe(statement, String.startsWith('RELEASE SAVEPOINT'))) {
            releases.push(statement);
          }
          return execute(statement, params, transformRows);
        });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          spy.mockRestore();
        })
      );

      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
            insert into
              parent
            values
              (1)
          `.pipe(sql.withTransaction);
          yield* sql`
            insert into
              parent
            values
              (2)
          `.pipe(Effect.andThen(Effect.fail('nested failure')), sql.withTransaction, Effect.flip);
          yield* sql`
            insert into
              parent
            values
              (3)
          `;
        })
      );
      expect(releases).toHaveLength(2);
      expect(
        yield* sql`
          select
            *
          from
            parent
          order by
            id
        `
      ).toEqual([{ id: 1 }, { id: 3 }]);
    }, Effect.provide(TestLayer))
  );

  it.effect(
    'keeps the connection leased until interrupted cleanup finishes',
    Effect.fnUntraced(function* () {
      const sql = yield* make;
      const connection = yield* Effect.scoped(sql.reserve);
      const execute = connection.executeUnprepared;
      const entered = yield* Deferred.make<true>();
      const release = yield* Deferred.make<true>();
      const spy = vi
        .spyOn(connection, 'executeUnprepared')
        .mockImplementation((statement, params, transformRows) =>
          statement === 'ROLLBACK'
            ? Deferred.succeed(entered, true).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.andThen(execute(statement, params, transformRows))
              )
            : execute(statement, params, transformRows)
        );
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          spy.mockRestore();
        })
      );

      const transaction = yield* sql
        .withTransaction(sql`
          insert into
            child
          values
            (1, 999)
        `)
        .pipe(Effect.exit, Effect.forkChild);
      yield* Deferred.await(entered);
      yield* Effect.gen(function* () {
        yield* Fiber.interrupt(transaction).pipe(Effect.forkChild);
        const reading = yield* Deferred.make<true>();
        const reader = yield* Deferred.succeed(reading, true).pipe(
          Effect.andThen(sql`
            select
              *
            from
              child
          `),
          Effect.forkChild
        );
        yield* Deferred.await(reading);
        yield* Effect.yieldNow;
        expect(reader.pollUnsafe()).toBe(void 0);
        yield* Deferred.succeed(release, true);
        yield* Fiber.await(transaction);
        expect(yield* Fiber.join(reader)).toEqual([]);
      }).pipe(Effect.ensuring(Deferred.succeed(release, true)));
    }, Effect.provide(TestLayer))
  );
});
