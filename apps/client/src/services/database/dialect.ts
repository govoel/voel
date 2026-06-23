import { open } from '@op-engineering/op-sqlite';
import type { DB, Scalar } from '@op-engineering/op-sqlite';
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

interface OpSqliteDialectConfig {
  filename: string;
  onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
}

export class OpSqliteDialect implements Dialect {
  readonly #config: OpSqliteDialectConfig;

  public constructor(config: OpSqliteDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  public createDriver(): Driver {
    return new OpSqliteDriver(this.#config);
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

export class OpSqliteDriver implements Driver {
  readonly #config: OpSqliteDialectConfig;

  #db?: DB;
  #connection?: DatabaseConnection;
  #connectionSemaphore?: TxSemaphore.TxSemaphore;

  public constructor(config: OpSqliteDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  public async init(): Promise<void> {
    this.#db = open({ name: this.#config.filename });
    this.#connectionSemaphore = await Effect.runPromise(TxSemaphore.make(1));

    this.#connection = new OpSqliteConnection(this.#db);

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

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
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

class OpSqliteConnection implements DatabaseConnection {
  readonly #db: DB;

  public constructor(db: DB) {
    this.#db = db;
  }

  public async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;

    // Execute each compiled query directly. Prepared statements only help when reused, and their
    // result shape differs from execute on native op-sqlite, which made zero-row reads ambiguous.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const result = await this.#db.execute(sql, parameters as Scalar[]);

    return {
      ...(typeof result.insertId === 'number' ? { insertId: BigInt(result.insertId) } : void 0),
      numAffectedRows: BigInt(result.rowsAffected),
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      rows: result.rows as O[],
    };
  }

  // oxlint-disable-next-line eslint/class-methods-use-this, eslint/require-yield
  public async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('OpSqlite driver does not support streaming of queries');
  }
}
