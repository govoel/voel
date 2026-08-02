import type { AtomSnapshotDto, AtomSummaryDto } from '#src/shared/transport.ts';

export interface TransportError {
  readonly code: 'atom-not-found' | 'state-not-found' | 'not-ready' | 'unknown';
  readonly message: string;
}

export type Response<T> =
  | {
      readonly requestId: string;
      readonly status: 'success';
      readonly data: T;
    }
  | {
      readonly requestId: string;
      readonly status: 'error';
      readonly error: TransportError;
    };

interface InitialState {
  readonly atoms: readonly AtomSummaryDto[];
}

export type Mutation =
  | { readonly type: 'activate-state'; readonly atomId: string; readonly stateId: string }
  | { readonly type: 'clear-state'; readonly atomId: string }
  | { readonly type: 'clear-all-states' }
  | { readonly type: 'refresh-atom'; readonly atomId: string };

export interface AtomDevToolsEventMap extends Record<string, unknown> {
  readonly 'request-initial-state': { readonly requestId: string };
  readonly 'initial-state-result': Response<InitialState>;
  readonly catalog: InitialState;
  readonly 'get-atom': { readonly requestId: string; readonly atomId: string };
  readonly 'get-atom-result': Response<AtomSnapshotDto>;
  readonly mutation: { readonly requestId: string; readonly mutation: Mutation };
  readonly 'mutation-result': Response<{ readonly mutation: Mutation }>;
}
