import type { useRouter } from 'expo-router';
import type { ComponentType } from 'react';

export type InvalidLinkScreenComponent = ComponentType;

export declare const InvalidLinkScreen: InvalidLinkScreenComponent;

export const goBackOrHome = ({
  router,
}: {
  readonly router: Pick<ReturnType<typeof useRouter>, 'canGoBack' | 'back' | 'replace'>;
}) => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
};
