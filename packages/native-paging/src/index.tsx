import { useAtomValue } from '@effect/atom-react';
import type { Effect, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { useRef, useState } from 'react';
import type { Ref } from 'react';

import { PagingOptions } from './model.ts';
import type { PageRequest, PageResponse } from './model.ts';
import { makePageRequests } from './requests.ts';
import type { NativePageRequest, PageCommands } from './requests.ts';

/**
 * Wrap a native paged view with a JS page loader. Native owns the paging session.
 * Change the React key when the dataset changes. Callback identity never resets it;
 * changing sizing options remounts the native view and cancels outstanding requests.
 */
export const createPagedView = <Props extends object, Value extends Schema.JsonObject>({
  name,
}: {
  readonly name: string;
}) => {
  interface PagingProps {
    readonly fetchPage: (
      request: typeof PageRequest.Type
    ) => Effect.Effect<PageResponse<Value>, unknown>;
    readonly pageSize?: number;
    /** Resident-window target, not a hard limit during page insertion/prefetch. */
    readonly maxResidentItems?: number;
  }
  const NativeView = requireNativeView<
    Omit<Props & PagingProps, keyof PagingProps> & {
      readonly paging: typeof PagingOptions.Type;
      readonly ref: Ref<PageCommands<Value>>;
      readonly onPageRequest: (event: { readonly nativeEvent: NativePageRequest }) => void;
      readonly onPageCancel: (event: {
        readonly nativeEvent: Pick<NativePageRequest, 'id'>;
      }) => void;
    }
  >(name);

  const Session = ({
    viewProps,
    fetchPage,
    paging,
  }: {
    readonly viewProps: Omit<Props & PagingProps, keyof PagingProps>;
    readonly fetchPage: PagingProps['fetchPage'];
    readonly paging: typeof PagingOptions.Type;
  }) => {
    const view = useRef<PageCommands<Value>>(null);
    const [bridgeAtom] = useState(() =>
      Atom.make(makePageRequests<Value>()).pipe(Atom.setIdleTTL(0))
    );
    const bridge = useAtomValue(bridgeAtom);

    // Do not start native paging before its request handler has a live scope.
    if (!AsyncResult.isSuccess(bridge)) {
      return null;
    }
    return (
      <NativeView
        {...viewProps}
        ref={view}
        paging={paging}
        onPageRequest={({ nativeEvent }) => {
          if (view.current !== null) {
            bridge.value.request({ request: nativeEvent, fetchPage, view: view.current });
          }
        }}
        onPageCancel={({ nativeEvent }) => {
          bridge.value.cancel(nativeEvent);
        }}
      />
    );
  };

  return function PagedView(props: Props & PagingProps) {
    const { fetchPage, pageSize = 50, maxResidentItems = 5 * pageSize, ...viewProps } = props;
    const paging = PagingOptions.make({ pageSize, maxResidentItems });
    return (
      <Session
        key={`${pageSize}:${maxResidentItems}`}
        viewProps={viewProps}
        fetchPage={fetchPage}
        paging={paging}
      />
    );
  };
};
