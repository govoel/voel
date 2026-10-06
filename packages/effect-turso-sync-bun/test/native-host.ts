import { Database as EmbeddedDatabase } from '@govoel/turso-database/compat';

/** The RN binding's API backed by the real Turso engine for host-independent
 * driver tests. This does not emulate or claim to test the mobile JSI bridge. */
export class Database {
  private readonly native: InstanceType<typeof EmbeddedDatabase>;

  public constructor({ path }: { readonly path: string }) {
    this.native = new EmbeddedDatabase(path);
  }

  public async connect() {
    if (!this.native.open) {
      throw new Error('Native host database is closed');
    }
  }

  public get inTransaction() {
    return this.native.inTransaction;
  }

  public async exec(sql: string) {
    this.native.exec(sql);
  }

  public prepare(sql: string) {
    const statement = this.native.prepare(sql);
    return {
      all: async (params: ReadonlyArray<unknown>) => {
        statement.raw(false);
        const rows: unknown = statement.all(...params);
        return rows;
      },
      allValues: async (params: ReadonlyArray<unknown>) => {
        statement.raw(true);
        const rows: unknown = statement.all(...params);
        return rows;
      },
      run: async (params: ReadonlyArray<unknown>) => statement.run(...params),
      columnCount: () => statement.columns().length,
      finalize: async () => {
        statement.close();
      },
    };
  }

  public close() {
    this.native.close();
  }
}
