import type { Database } from 'bun:sqlite';

const stateTable = '__source_tap_state';
const deleteTriggerPrefix = '__source_tap_delete_';

const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * Persistent state used to tell whether deletes may be missing from a client's
 * local snapshot.
 *
 * SQLite only supports row-level triggers. Incrementing once per deleted row is
 * intentional: it keeps the state update in the same transaction as the delete
 * (including deletes caused by cascades or other triggers).
 */
export class SourceTapSyncState {
  readonly #database: Database;
  readonly #pendingTables: Set<string>;
  readonly #trackTables: ReadonlySet<string>;
  #schemaVersion = -1;

  public constructor(database: Database, trackTables: ReadonlySet<string>) {
    this.#database = database;
    this.#trackTables = trackTables;
    this.#pendingTables = new Set(trackTables);

    this.#database.run(`
      create table if not exists ${quoteIdentifier(stateTable)} (
        singleton integer primary key check (singleton = 1),
        instance_id text not null,
        delete_version integer not null
      )
    `);
    this.#database.run(`
      insert or ignore into ${quoteIdentifier(stateTable)}
        (singleton, instance_id, delete_version)
      values
        (1, lower(hex(randomblob(16))), 0)
    `);

    this.ensureDeleteTriggers();
  }

  /** Rechecks every tracked table after a schema change or before a mutation. */
  public ensureDeleteTriggers() {
    if (this.getSchemaVersion() !== this.#schemaVersion) {
      for (const table of this.#trackTables) {
        this.#pendingTables.add(table);
      }
    }
    this.installDeleteTriggers();
  }

  /** Installs triggers for tracked tables that have been created since startup. */
  public installDeleteTriggers() {
    if (this.#pendingTables.size === 0) {
      return;
    }

    const existingTables = new Set(
      this.#database
        .query<{ name: string }, []>("select name from sqlite_schema where type = 'table'")
        .all()
        .map(({ name }) => name)
    );

    for (const table of this.#pendingTables) {
      if (existingTables.has(table)) {
        this.#database.run(`
          create trigger if not exists ${quoteIdentifier(`${deleteTriggerPrefix}${table}`)}
          after delete on ${quoteIdentifier(table)}
          begin
            update ${quoteIdentifier(stateTable)}
            set delete_version = delete_version + 1
            where singleton = 1;
          end
        `);
        this.#pendingTables.delete(table);
      }
    }

    this.#schemaVersion = this.getSchemaVersion();
  }

  private getSchemaVersion(): number {
    return (
      this.#database.query<{ schema_version: number }, []>('pragma schema_version').get()
        ?.schema_version ?? -1
    );
  }

  public getSyncToken(): string {
    const state = this.#database
      .query<{ deleteVersion: string; instanceId: string }, []>(`
        select
          cast(delete_version as text) as deleteVersion,
          instance_id as instanceId
        from ${quoteIdentifier(stateTable)}
        where singleton = 1
      `)
      .get();

    if (state === null) {
      throw new Error('SourceTap could not read its persistent sync state');
    }

    return `${state.instanceId}:${state.deleteVersion}`;
  }
}
