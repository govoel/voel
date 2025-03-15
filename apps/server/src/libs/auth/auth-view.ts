import { type Context } from 'elysia';

import { auth } from '@/libs/auth/auth';

const betterAuthView = async (context: Context) => {
  const BETTER_AUTH_ACCEPT_METHODS = ['POST', 'GET'];
  if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
    return auth.handler(context.request);
  } else {
    context.error(405);
  }
};

export default betterAuthView;
