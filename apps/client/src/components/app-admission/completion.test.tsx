import { render } from '@testing-library/react-native';
import { useImperativeHandle } from 'react';
import type { PropsWithChildren, Ref } from 'react';
import { Text, View } from 'react-native';
import { beforeEach, expect, it, vi } from 'vitest';
import { AddAccountScreen as AndroidSignIn } from '#src/domains/accounts/features/add/screen.android.tsx';
import { AddAccountScreen as IOSSignIn } from '#src/domains/accounts/features/add/screen.ios.tsx';
import { SetupServerScreen as AndroidSetup } from '#src/domains/accounts/features/setup/screen.android.tsx';
import { SetupServerScreen as IOSSetup } from '#src/domains/accounts/features/setup/screen.ios.tsx';


const completion = vi.hoisted(() => ({
  onSuccess: async (): Promise<void> => {
    throw new Error('Form not mounted');
  },
  hide: vi.fn(async () => void 0),
  router: { back: vi.fn(), dismissTo: vi.fn() },
}));

// Exercise management modal completion adapters, not form submission or onboarding admission.
const Content = vi.hoisted(() => ({ children }: PropsWithChildren) => <View>{children}</View>);
const form = { AppForm: Content, AppField: () => null, SubmitButton: Content };
vi.mock('#src/domains/accounts/features/add/model.ts', () => ({
  useAddAccountForm: ({ onSuccess }: { onSuccess: () => Promise<void> }) => {
    completion.onSuccess = onSuccess;
    return form;
  },
}));
vi.mock('#src/domains/accounts/features/setup/model.ts', () => ({
  useSetupServerForm: ({ onSuccess }: { onSuccess: () => Promise<void> }) => {
    completion.onSuccess = onSuccess;
    return form;
  },
}));
vi.mock('expo-router', () => ({
  useRouter: () => completion.router,
  useLocalSearchParams: () => ({}),
  Stack: { Screen: { Title: ({ children }: PropsWithChildren) => <Text>{children}</Text> } },
}));
vi.mock('@expo/ui', () => ({ Host: Content }));
vi.mock('@expo/ui/swift-ui', () => ({ Group: Content, Host: Content }));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({ buttonStyle: vi.fn(), frame: vi.fn() }));
vi.mock('@expo/ui/jetpack-compose', () => ({ Host: Content }));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: vi.fn() }));
vi.mock('#src/components/form/layout', () => ({ FormLayout: Content }));
vi.mock('#src/components/text', () => ({ Text: Content }));
vi.mock('#src/constants/material.ts', () => ({ materialSeedColor: '#000000' }));
vi.mock('#src/components/android-sheet/index.tsx', () => ({
  AndroidAccountsSheet: ({
    children,
    ref,
  }: PropsWithChildren<{ ref: Ref<{ hide: () => Promise<void> }> }>) => {
    useImperativeHandle(ref, () => ({ hide: completion.hide }));
    return <View>{children}</View>;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
});

const screens = [
  { name: 'iOS sign-in', Screen: IOSSignIn, android: false },
  { name: 'iOS setup', Screen: IOSSetup, android: false },
  { name: 'Android sign-in', Screen: AndroidSignIn, android: true },
  { name: 'Android setup', Screen: AndroidSetup, android: true },
];

it.each(screens)(
  '$name management preserves ordinary modal completion',
  async ({ Screen, android }) => {
    await render(<Screen mode="management" />);
    await completion.onSuccess();
    if (android) {
      expect(completion.hide).toHaveBeenCalledTimes(1);
      expect(completion.router.dismissTo).toHaveBeenCalledExactlyOnceWith('/accounts');
      expect(completion.router.back).not.toHaveBeenCalled();
    } else {
      expect(completion.router.back).toHaveBeenCalledTimes(1);
      expect(completion.hide).not.toHaveBeenCalled();
      expect(completion.router.dismissTo).not.toHaveBeenCalled();
    }
  }
);
