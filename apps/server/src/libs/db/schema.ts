import type { ColumnType } from 'kysely';

export interface LibraryTable {
  id: ColumnType<number, never, never>;
  name: ColumnType<string, string, string>;
  createdAt: ColumnType<number, never, never>;
  updatedAt: ColumnType<number, never, never>;
  deletedAt: ColumnType<number | null, never, number>;
}

export interface DatabaseSchema {
  library: LibraryTable;
}
