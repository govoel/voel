import { useFocusEffect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

export const DismissTo = ({ href }: { readonly href: Href }) => {
  const router = useRouter();
  useFocusEffect(() => {
    router.dismissTo(href);
  });
  return null;
};
