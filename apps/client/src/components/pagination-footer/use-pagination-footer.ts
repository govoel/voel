import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { PaginationFooterComponent } from '#src/components/pagination-footer';

export const usePaginationFooter = ({
  page,
  waiting,
  onLoadMore,
}: ComponentProps<PaginationFooterComponent>) => {
  const [visible, setVisible] = useState(false);
  const requestedPage = useRef<typeof page | null>(null);

  useEffect(() => {
    if (!visible || waiting || page.done || requestedPage.current === page) {
      return;
    }
    // Native visibility events can repeat before the atom publishes its waiting state.
    requestedPage.current = page;
    onLoadMore();
  }, [visible, waiting, page, onLoadMore]);

  return setVisible;
};
