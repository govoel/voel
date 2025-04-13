import { type DB, open } from '@op-engineering/op-sqlite';
import {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  IdentifierNode,
  Kysely,
  Migration,
  MigrationProvider,
  QueryCompiler,
  QueryResult,
  RawNode,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  createQueryId,
} from 'kysely';

export interface OpSqliteDialectConfig {
  database: string | DB | (() => Promise<DB>);
  onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
}

export function freeze<T>(obj: T): Readonly<T> {
  return Object.freeze(obj);
}

function parseSavepointCommand(command: string, savepointName: string): RawNode {
  return RawNode.createWithChildren([
    RawNode.createWithSql(`${command} `),
    IdentifierNode.create(savepointName), // ensures savepointName gets sanitized
  ]);
}

/**
 * OP-SQLite dialect that uses the [op-sqlite](https://github.com/OP-Engineering/op-sqlite) library.
 *
 * The constructor takes an instance of {@link OpSqliteDialectConfig}.
 *
 * ```ts
 * import { open } from '@op-engineering/op-sqlite'
 *
 * new OpSqliteDialect({
 *   database: open({ name: 'db.sqlite' })
 * })
 * ```
 *
 * If you want the pool to only be created once it's first used, `database`
 * can be a function:
 *
 * ```ts
 * import { open } from '@op-engineering/op-sqlite'
 *
 * new OpSqliteDialect({
 *   database: async () => open({ name: 'db.sqlite' })
 * })
 * ```
 */
export class OpSqliteDialect implements Dialect {
  readonly #config: OpSqliteDialectConfig;

  constructor(config: OpSqliteDialectConfig) {
    this.#config = freeze({ ...config });
  }

  createDriver(): Driver {
    return new OpSqliteDriver(this.#config);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

export class OpSqliteDriver implements Driver {
  readonly #config: OpSqliteDialectConfig;
  readonly #connectionMutex = new ConnectionMutex();

  #db?: DB;
  #connection?: DatabaseConnection;

  constructor(config: OpSqliteDialectConfig) {
    this.#config = freeze({ ...config });
  }

  async init(): Promise<void> {
    if (typeof this.#config.database === 'string') {
      this.#db = open({ name: this.#config.database });
    } else if (typeof this.#config.database === 'function') {
      this.#db = await this.#config.database();
    } else {
      this.#db = this.#config.database;
    }

    this.#connection = new OpSqliteConnection(this.#db);

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

  async savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('savepoint', savepointName), createQueryId())
    );
  }

  async rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('rollback to', savepointName), createQueryId())
    );
  }

  async releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler['compileQuery']
  ): Promise<void> {
    await connection.executeQuery(
      compileQuery(parseSavepointCommand('release', savepointName), createQueryId())
    );
  }

  async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock();
  }

  async destroy(): Promise<void> {
    this.#db?.close();
  }
}

class OpSqliteConnection implements DatabaseConnection {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;

    const stmt = this.#db.prepareStatement(sql);

    stmt.bind(parameters as any[]);

    const result = await stmt.execute();

    return {
      rows: result.rows as O[],
      numAffectedRows: BigInt(result.rowsAffected),
      insertId: result.insertId ? BigInt(result.insertId) : undefined,
    };
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery,
    _chunkSize: number
  ): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('OpSqlite driver does not support streaming of queries');
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

export class ExpoMigrationProvider implements MigrationProvider {
  migrations: Record<string, Migration>;

  constructor(props: { migrations: Record<string, Migration> }) {
    this.migrations = props.migrations;
  }

  public getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(this.migrations);
  }
}
