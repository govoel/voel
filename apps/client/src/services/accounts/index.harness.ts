import { it } from '@repo/effect-react-native-harness';

it.todo('AccountManager initializes with no active account when the database has none');
it.todo('AccountManager restores the active account from the database on startup');
it.todo('AccountManager auth storage adapter reads from and writes to AuthClientStorage');

it.todo('AccountManager setActiveAccount no-ops when setting the already active account');
it.todo(
  'AccountManager setActiveAccount atomically deactivates old rows and activates the new row'
);
it.todo(
  'AccountManager setActiveAccount reactivates an existing account instead of duplicating it'
);
it.todo('AccountManager setActiveAccount closes the previous auth-client scope when switching');

it.todo(
  'AccountManager removeAccount leaves active state unchanged when removing an inactive account'
);
it.todo(
  'AccountManager removeAccount clears active state and closes scope when removing active account'
);
it.todo('AccountManager removeAccount is harmless when the account does not exist');

it.todo('AccountManager upsertAccount signs in, persists the account, and makes it active');
it.todo('AccountManager upsertAccount maps thrown sign-in failures to AccountSignInError UNKNOWN');
it.todo('AccountManager upsertAccount maps Better Auth sign-in errors to AccountSignInError');
it.todo(
  'AccountManager upsertAccount reuses the signed-in auth client when activating the account'
);

it.todo(
  'AccountManager setupServerWithAccount signs up, persists the account, and makes it active'
);
it.todo(
  'AccountManager setupServerWithAccount maps thrown sign-up failures to AccountSignUpError UNKNOWN'
);
it.todo(
  'AccountManager setupServerWithAccount maps Better Auth sign-up errors to AccountSignUpError'
);
it.todo(
  'AccountManager setupServerWithAccount reuses the signed-up auth client when activating the account'
);
