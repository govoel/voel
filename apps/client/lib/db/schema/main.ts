import type { ColumnType } from 'kysely';

export type AccountRole = 'under18' | 'user' | 'admin';

export interface AccountsTable {
  instanceId: ColumnType<number, never, never>;
  instanceURL: ColumnType<string, string, never>;
  userId: ColumnType<string, string, never>;
  username: string;
  email: string;
  name: string;
  image?: string;
  role?: AccountRole;
  updatedAt: ColumnType<number, number, number>;
}

export interface MainDatabase {
  accounts: AccountsTable;
}
