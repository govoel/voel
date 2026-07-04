import type { Database, SQLQueryBindings } from 'bun:sqlite';

import { Effect, TxSemaphore } from 'effect';

import {
  CompiledQuery,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from '@repo/effect-kysely';
import type {
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
} from '@repo/effect-kysely';

interface SourceTapDialectConfig {
  database: Database;
  onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
  onBeginTransaction?: () => void;
  onCommitTransaction?: () => void;
  onRollbackTransaction?: () => void;
}

export class SourceTapDialect implements Dialect {
  readonly #config: SourceTapDialectConfig;

  public constructor(config: SourceTapDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  public createDriver(): Driver {
    return new SourceTapSqliteDriver(this.#config);
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

class SourceTapSqliteDriver implements Driver {
  readonly #config: SourceTapDialectConfig;

  #db?: Database;
  #connection?: DatabaseConnection;
  #connectionSemaphore?: TxSemaphore.TxSemaphore;

  public constructor(config: SourceTapDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  public async init(): Promise<void> {
    this.#db = this.#config.database;
    this.#connectionSemaphore = await Effect.runPromise(TxSemaphore.make(1));

    this.#connection = new SourceTapSqliteConnection(this.#db);

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection);
    }
  }

  public async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.#connection || !this.#connectionSemaphore) {
      throw new Error('Connection has not been initialized. Call init() first.');
    }
    // SQLite only has one single connection. We use a mutex here to wait
    // until the single connection has been released.
    await Effect.runPromise(TxSemaphore.acquire(this.#connectionSemaphore));
    return this.#connection;
  }

  public async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
    this.#config.onBeginTransaction?.();
  }

  public async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
    this.#config.onCommitTransaction?.();
  }

  public async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
    this.#config.onRollbackTransaction?.();
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async savepoint(): Promise<void> {
    throw new Error('Savepoints are deliberately not supported');
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async rollbackToSavepoint(): Promise<void> {
    throw new Error('Savepoints are deliberately not supported');
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async releaseSavepoint(): Promise<void> {
    throw new Error('Savepoints are deliberately not supported');
  }

  public async releaseConnection(): Promise<void> {
    if (!this.#connectionSemaphore) {
      throw new Error('Connection has not been initialized. Call init() first.');
    }
    await Effect.runPromise(TxSemaphore.release(this.#connectionSemaphore));
  }

  public async destroy(): Promise<void> {
    this.#db?.close();
  }
}

class SourceTapSqliteConnection implements DatabaseConnection {
  readonly #db: Database;

  public constructor(db: Database) {
    this.#db = db;
  }

  public async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare<O, SQLQueryBindings[]>(sql);

    if (stmt.columnNames.length > 0) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-argument
      const rows = stmt.all(parameters as any);
      return {
        // hack to get the last inserted id, which is ok
        // only because of the connection mutex guaranteeing
        // that no other queries are running in between
        insertId: BigInt(
          this.#db.query<{ id: number }, []>('select last_insert_rowid() as id').get()?.id ?? 0
        ),
        numAffectedRows: BigInt(rows.length),
        rows,
      };
    }

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-argument
    const results = stmt.run(parameters as any);
    return {
      insertId: BigInt(results.lastInsertRowid),
      numAffectedRows: BigInt(results.changes),
      rows: [],
    };
  }

  public async *streamQuery<R>(
    compiledQuery: CompiledQuery
  ): AsyncIterableIterator<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare(sql);

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-argument
    for (const row of stmt.iterate(parameters as any)) {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      yield { rows: [row as R] };
    }
  }
}
