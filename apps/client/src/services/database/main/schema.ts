import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';

import type { TableFromModel } from '@repo/effect-kysely';

export class Account extends Model.Class<Account>('voel/database/main/Account')({
  serverUrl: Model.Field({
    select: Schema.String.pipe(Schema.brand('voel/database/main/Account/serverUrl')),
    insert: Schema.String,
    update: Schema.String,
  }),
  username: Model.Field({
    select: Schema.String.pipe(Schema.brand('voel/database/main/Account/username')),
    insert: Schema.String,
    update: Schema.String,
  }),
  active: Model.Field({
    select: Schema.Literals([0, 1]).pipe(Schema.brand('voel/database/main/Account/active')),
    insert: Schema.Literals([0, 1]),
    update: Schema.Literals([0, 1]),
  }),
  createdAt: Model.Field({ select: Schema.Int }),
  updatedAt: Model.Field({ select: Schema.Int }),
}) {}

export type AccountTable = TableFromModel<typeof Account>;

export interface MainDatabaseTables {
  account: AccountTable;
}
