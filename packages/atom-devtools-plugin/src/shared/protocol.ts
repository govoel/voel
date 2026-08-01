import type { AtomSnapshotDto, AtomSummaryDto } from './transport.ts';

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

export interface RequestInitialStateEvent {
  readonly requestId: string;
}

export interface InitialState {
  readonly atoms: readonly AtomSummaryDto[];
}

export interface GetAtomEvent {
  readonly requestId: string;
  readonly atomId: string;
}

export type Mutation =
  | { readonly type: 'activate-state'; readonly atomId: string; readonly stateId: string }
  | { readonly type: 'clear-state'; readonly atomId: string }
  | { readonly type: 'clear-all-states' }
  | { readonly type: 'refresh-atom'; readonly atomId: string };

export interface MutationEvent {
  readonly requestId: string;
  readonly mutation: Mutation;
}

export interface MutationSuccess {
  readonly mutation: Mutation;
}

export interface AtomDevToolsEventMap extends Record<string, unknown> {
  readonly 'request-initial-state': RequestInitialStateEvent;
  readonly 'initial-state-result': Response<InitialState>;
  readonly catalog: InitialState;
  readonly 'get-atom': GetAtomEvent;
  readonly 'get-atom-result': Response<AtomSnapshotDto>;
  readonly mutation: MutationEvent;
  readonly 'mutation-result': Response<MutationSuccess>;
}
