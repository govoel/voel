import { Database, type SQLQueryBindings } from 'bun:sqlite';
import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';

/**
 * Config for the SQLite dialect.
 */
interface SolarCoreDialectConfig {
  /**
   * An sqlite Database instance or a function that returns one.
   */
  database: Database;

  /**
   * Called once when the first query is executed.
   */
  onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
}

export class SolarCoreDialect implements Dialect {
  readonly #config: SolarCoreDialectConfig;

  constructor(config: SolarCoreDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  createDriver(): Driver {
    return new SolarCoreSqliteDriver(this.#config);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

class SolarCoreSqliteDriver implements Driver {
  readonly #config: SolarCoreDialectConfig;
  readonly #connectionMutex = new ConnectionMutex();

  #db?: Database;
  #connection?: DatabaseConnection;

  constructor(config: SolarCoreDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  async init(): Promise<void> {
    this.#db = this.#config.database;

    this.#connection = new SolarCoreSqliteConnection(this.#db);

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection);
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    // SQLite only has one single connection. We use a mutex here to wait
    // until the single connection has been released.
    await this.#connectionMutex.lock();
    return this.#connection!;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock();
  }

  async destroy(): Promise<void> {
    this.#db?.close();
  }
}

class SolarCoreSqliteConnection implements DatabaseConnection {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare<O, SQLQueryBindings[]>(sql);

    if (stmt.columnNames.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = stmt.all(parameters as any);
      return Promise.resolve({
        // hack to get the last inserted id
        // this is ok only because of the connection mutex
        // guaranteeing that no other queries are running
        // in between
        insertId: BigInt(
          this.#db.query<{ id: number }, []>('select last_insert_rowid() as id').get()?.id ?? 0
        ),
        numAffectedRows: BigInt(rows.length),
        rows,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = stmt.run(parameters as any);
    return Promise.resolve({
      insertId: BigInt(results.lastInsertRowid),
      numAffectedRows: BigInt(results.changes),
      rows: [],
    });
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare(sql);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const row of stmt.iterate(parameters as any)) {
      yield { rows: [row as R] };
    }
  }
}

export class BunSqliteDialect implements Dialect {
  readonly #config: SolarCoreDialectConfig;

  constructor(config: SolarCoreDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  createDriver(): Driver {
    return new BunSqliteDriver(this.#config);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

class BunSqliteDriver implements Driver {
  readonly #config: SolarCoreDialectConfig;
  readonly #connectionMutex = new ConnectionMutex();

  #db?: Database;
  #connection?: DatabaseConnection;

  constructor(config: SolarCoreDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  async init(): Promise<void> {
    this.#db = this.#config.database;

    this.#connection = new BunSqliteConnection(this.#db);

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection);
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    // SQLite only has one single connection. We use a mutex here to wait
    // until the single connection has been released.
    await this.#connectionMutex.lock();
    return this.#connection!;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock();
  }

  async destroy(): Promise<void> {
    this.#db?.close();
  }
}

class BunSqliteConnection implements DatabaseConnection {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare<O, SQLQueryBindings[]>(sql);

    if (stmt.columnNames.length > 0) {
      return Promise.resolve({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: stmt.all(parameters as any),
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = stmt.run(parameters as any);
    return Promise.resolve({
      insertId: BigInt(results.lastInsertRowid),
      numAffectedRows: BigInt(results.changes),
      rows: [],
    });
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare(sql);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const row of stmt.iterate(parameters as any)) {
      yield { rows: [row as R] };
    }
  }
}

class ConnectionMutex {
  #promise?: Promise<void>;
  #resolve?: () => void;

  async lock(): Promise<void> {
    while (this.#promise) {
      await this.#promise;
    }

    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  unlock(): void {
    const resolve = this.#resolve;

    this.#promise = undefined;
    this.#resolve = undefined;

    resolve?.();
  }
}
