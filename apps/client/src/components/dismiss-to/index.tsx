import { useFocusEffect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

/**
 * Like `Redirect`, but returns to `href` if it's already on the stack instead of pushing a copy.
 * Navigates only while focused, so a screen someone already left can't move them.
 */
export const DismissTo = ({ href }: { readonly href: Href }) => {
  const router = useRouter();
  useFocusEffect(() => {
    router.dismissTo(href);
  });
  return null;
};
