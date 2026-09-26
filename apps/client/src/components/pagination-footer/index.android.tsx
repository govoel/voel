import { LoadingIndicator } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, onVisibilityChanged, padding } from '@expo/ui/jetpack-compose/modifiers';

import type { PaginationFooterComponent } from '#src/components/pagination-footer';
import { usePaginationFooter } from '#src/components/pagination-footer/use-pagination-footer.ts';
import { Spacing } from '#src/constants/theme.ts';

export const PaginationFooter = ((props) => {
  const setVisible = usePaginationFooter(props);
  return props.page.done ? null : (
    <LoadingIndicator
      modifiers={[
        fillMaxWidth(),
        padding(Spacing.three, Spacing.three, Spacing.three, Spacing.three),
        onVisibilityChanged(setVisible, { minFractionVisible: 0.1 }),
      ]}
    />
  );
}) satisfies PaginationFooterComponent;
