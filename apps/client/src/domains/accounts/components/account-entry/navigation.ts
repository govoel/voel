import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

export const useCompleteAccountEntry = ({
  beforeDismiss,
}: { readonly beforeDismiss?: () => Promise<void> } = {}) => {
  const router = useRouter();
  const navigation = useNavigation();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  return async () => {
    // A dismissed form may finish authenticating, but no longer owns navigation.
    if (!navigation.isFocused()) {
      return;
    }
    await beforeDismiss?.();
    if (navigation.isFocused()) {
      router.dismissTo(returnTo === '/accounts' ? '/accounts' : '/');
    }
  };
};
