import { Schema } from 'effect';
import { requireNativeModule } from 'expo';
import type { SharedObject } from 'expo';

import { PagerOptions } from './model.ts';
import type { PageRequest, PageResponse } from './model.ts';

export type NativePager = InstanceType<
  SharedObject<{
    request: (request: typeof PageRequest.Type) => void;
    cancel: (request: Pick<typeof PageRequest.Type, 'id'>) => void;
  }>
> & {
  readonly start: () => void;
  readonly refresh: () => void;
  readonly retry: () => void;
  readonly resolve: (
    id: typeof PageRequest.Type.id,
    items: typeof PageResponse.Type.items,
    total: typeof PageResponse.Type.total
  ) => void;
  readonly reject: (id: typeof PageRequest.Type.id) => void;
  readonly close: () => void;
};

export const createNativePager = (options: typeof PagerOptions.Type) => {
  const module = requireNativeModule<{
    readonly Pager: new (options: typeof PagerOptions.Type) => NativePager;
  }>('VoelNativePaging');
  return new module.Pager(Schema.decodeSync(PagerOptions)(options));
};
