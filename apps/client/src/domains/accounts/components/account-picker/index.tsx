import type { ComponentType } from 'react';

import type { Account } from '#src/domains/accounts/repository.ts';

export declare const AccountPicker: ComponentType<{
  readonly accounts: ReadonlyArray<typeof Account.Type>;
  readonly onSelected: () => void | Promise<void>;
}>;
