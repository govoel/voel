import type { Database, SQLQueryBindings } from 'bun:sqlite';

import {
  CompiledQuery,
  IdentifierNode,
  RawNode,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  createQueryId,
} from 'kysely';
import type {
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
} from 'kysely';

/**
 * Config for the SQLite dialect.
 */
interface SourceTapDialectConfig {
  /**
   * An sqlite Database instance or a function that returns one.
   */
  database: Database;

  /**
   * Called once when the first query is executed.
   */
  onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
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

const parseSavepointCommand = (command: string, savepointName: string): RawNode =>
  RawNode.createWithChildren([
    RawNode.createWithSql(`${command} `),
    IdentifierNode.create(savepointName), // ensures savepointName gets sanitized
  ]);

class SourceTapSqliteDriver implements Driver {
  readonly #config: SourceTapDialectConfig;
  readonly #connectionMutex = new ConnectionMutex();

  #db?: Database;
  #connection?: DatabaseConnection;

  public constructor(config: SourceTapDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  public async init(): Promise<void> {
    this.#db = this.#config.database;

    this.#connection = new SourceTapSqliteConnection(this.#db);

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection);
    }
  }

  public async acquireConnection(): Promise<DatabaseConnection> {
    // SQLite only has one single connection. We use a mutex here to wait
    // until the single connection has been released.
    await this.#connectionMutex.lock();
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#connection!;
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
  public async savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('savepoint', savepointName), createQueryId())
    );
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('rollback to', savepointName), createQueryId())
    );
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('release', savepointName), createQueryId())
    );
  }

  public async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock();
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
        // hack to get the last inserted id
        // this is ok only because of the connection mutex
        // guaranteeing that no other queries are running
        // in between
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
    for await (const row of stmt.iterate(parameters as any)) {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      yield { rows: [row as R] };
    }
  }
}

export class BunSqliteDialect implements Dialect {
  readonly #config: SourceTapDialectConfig;

  public constructor(config: SourceTapDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  public createDriver(): Driver {
    return new BunSqliteDriver(this.#config);
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

class BunSqliteDriver implements Driver {
  readonly #config: SourceTapDialectConfig;
  readonly #connectionMutex = new ConnectionMutex();

  #db?: Database;
  #connection?: DatabaseConnection;

  public constructor(config: SourceTapDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  public async init(): Promise<void> {
    this.#db = this.#config.database;

    this.#connection = new BunSqliteConnection(this.#db);

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection);
    }
  }

  public async acquireConnection(): Promise<DatabaseConnection> {
    // SQLite only has one single connection. We use a mutex here to wait
    // until the single connection has been released.
    await this.#connectionMutex.lock();
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#connection!;
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
  public async savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('savepoint', savepointName), createQueryId())
    );
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('rollback to', savepointName), createQueryId())
    );
  }

  // oxlint-disable-next-line eslint/class-methods-use-this
  public async releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('release', savepointName), createQueryId())
    );
  }

  public async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock();
  }

  public async destroy(): Promise<void> {
    this.#db?.close();
  }
}

class BunSqliteConnection implements DatabaseConnection {
  readonly #db: Database;

  public constructor(db: Database) {
    this.#db = db;
  }

  public async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare<O, SQLQueryBindings[]>(sql);

    if (stmt.columnNames.length > 0) {
      return {
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-argument
        rows: stmt.all(parameters as any),
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
    for await (const row of stmt.iterate(parameters as any)) {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      yield { rows: [row as R] };
    }
  }
}

class ConnectionMutex {
  #promise?: Promise<void> | undefined;
  #resolve?: (() => void) | undefined;

  public async lock(): Promise<void> {
    while (this.#promise) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await this.#promise;
    }

    // @effect-diagnostics-next-line newPromise:off
    // oxlint-disable-next-line promise/avoid-new
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  public unlock(): void {
    const resolve = this.#resolve;

    this.#promise = void 0;
    this.#resolve = void 0;

    resolve?.();
  }
}
