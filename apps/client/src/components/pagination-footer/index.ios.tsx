import { HStack, ProgressView, Spacer } from '@expo/ui/swift-ui';
import { onAppear, onDisappear } from '@expo/ui/swift-ui/modifiers';

import type { PaginationFooterComponent } from '#src/components/pagination-footer';
import { usePaginationFooter } from '#src/components/pagination-footer/index.tsx';

export const PaginationFooter = ((props) => {
  const setVisible = usePaginationFooter(props);
  return props.page.done ? null : (
    <HStack
      modifiers={[
        onAppear(() => {
          setVisible(true);
        }),
        onDisappear(() => {
          setVisible(false);
        }),
      ]}>
      <Spacer />
      <ProgressView />
      <Spacer />
    </HStack>
  );
}) satisfies PaginationFooterComponent;
