import type { ComponentType } from 'react';

import type { Account } from '#src/domains/accounts/schema.ts';

export declare const AccountPicker: ComponentType<{
  readonly entryActions?: boolean;
  readonly accounts: ReadonlyArray<Account>;
  readonly onSelected?: () => Promise<void>;
}>;
export declare const InlineAccountPicker: ComponentType<{
  readonly accounts: ReadonlyArray<Account>;
}>;
