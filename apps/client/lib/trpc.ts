import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@voel/server/src/router/root';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
