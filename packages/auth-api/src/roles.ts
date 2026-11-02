import { adminAc, defaultAc, userAc } from 'better-auth/plugins/admin/access';
import { Array } from 'effect';

import type { AuthUser } from '#src/shared.ts';

const adminRole = defaultAc.newRole({
  ...adminAc.statements,
  user: Array.filter(adminAc.statements.user, (action) => action !== 'ban'),
});

export const authRoles = { admin: adminRole, user: userAc, under18: userAc } satisfies Record<
  typeof AuthUser.fields.role.Encoded,
  typeof userAc | typeof adminRole
>;
