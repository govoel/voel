import type { ColumnType } from '@repo/effect-kysely';
import type { DatabaseTables } from '@repo/spec-api/database/schema.ts';

type WritableTable<Table> = {
  [Column in keyof Table]: Table[Column] extends ColumnType<infer Select, unknown, unknown>
    ? ColumnType<Select, Select, Select>
    : never;
};

export type AccountDatabaseTables = {
  [Table in keyof DatabaseTables]: WritableTable<DatabaseTables[Table]>;
};
