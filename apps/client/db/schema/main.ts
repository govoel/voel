import { ColumnType } from 'kysely';

export interface AccountsTable {
  instanceID: ColumnType<number, never, never>;
  instanceURL: ColumnType<string, string, never>;
  userID: ColumnType<string, string, never>;
  username: ColumnType<string, string, string>;
  email: ColumnType<string, string, string>;
  name: ColumnType<string, string, string>;
  image?: string;
}

export interface MainDatabase {
  accounts: AccountsTable;
}
