import { useAtomRefresh, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { Stack, useTheme } from 'expo-router';
import type { ReactElement } from 'react';
import { Button, Text, View } from 'react-native';

import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import { AppRuntime } from '#src/runtime/index.ts';

/** Restoration must finish before either complementary route group is admitted. */
export const AppAdmission = ({ loading }: { readonly loading: ReactElement }) => {
  const selection = useAtomValue(activeAccountKeyAtom);
  // Startup restoration belongs to runtime construction; refreshing only the
  // selection stream would keep the failed manager layer cached.
  const retry = useAtomRefresh(AppRuntime);
  const { colors } = useTheme();

  if (AsyncResult.isInitial(selection) || (AsyncResult.isFailure(selection) && selection.waiting)) {
    return loading;
  }
  if (AsyncResult.isFailure(selection)) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}>
        <Text style={{ color: colors.text }}>Unable to restore accounts.</Text>
        <Button title="Retry" onPress={retry} color={colors.primary} />
      </View>
    );
  }

  const selected = Option.isSome(selection.value);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={selected} redirectTo="/(onboarding)/welcome">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!selected}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
    </Stack>
  );
};
