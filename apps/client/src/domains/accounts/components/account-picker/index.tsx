import type { ComponentType } from 'react';

import type { AccountRepository } from '#src/domains/accounts/repository.ts';

export declare const AccountPicker: ComponentType<{
  readonly accounts: ReadonlyArray<typeof AccountRepository.fromRow.Type>;
  readonly onSelected: () => Promise<void>;
}>;
