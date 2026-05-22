import { AtomRpc } from 'effect/unstable/reactivity';

import { Api } from '@repo/spec-api';

export class ApiClient extends AtomRpc.Service<ApiClient>()('voel/services/api-client/ApiClient', {
  group: Api,
  protocol: /* TODO */,
}) {}
