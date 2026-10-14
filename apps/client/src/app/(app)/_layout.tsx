import { useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { AccountsAutoPresenter } from '#src/domains/accounts/components/auto-presenter/index.tsx';
import { SelectedAccountProvider } from '#src/domains/accounts/features/selection.ts';
import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';


export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const selection = useAtomValue(activeAccountKeyAtom);
  // The root owns loading/error/empty admission. Do not expose an obsolete scope while it exits.
  if (!AsyncResult.isSuccess(selection) || Option.isNone(selection.value)) {
    return null;
  }
  const account = selection.value.value;

  return (
    <Stack
      screenOptions={{ headerShown: false }}
      // Keep the navigator itself outside the keyed UI scope; switching is not a history reset.
      layout={({ children }) => (
        <SelectedAccountProvider
          key={JSON.stringify([account.serverUrl, account.userId, account.authStorageId])}
          value={account}>
          {children}
          <AccountsAutoPresenter />
        </SelectedAccountProvider>
      )}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="accounts"
        options={
          Platform.OS === 'android'
            ? {
                presentation: 'transparentModal',
                contentStyle: { backgroundColor: 'transparent' },
              }
            : { presentation: 'modal' }
        }
      />
    </Stack>
  );
}
