import type { SharedObject } from 'expo';

import type { PageRequest, PageResponse } from './model.ts';

export type NativePager<Value> = InstanceType<
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
    items: PageResponse<Value>['items'],
    total: PageResponse<Value>['total']
  ) => void;
  readonly reject: (id: typeof PageRequest.Type.id) => void;
  readonly close: () => void;
};
