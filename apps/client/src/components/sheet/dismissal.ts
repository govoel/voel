import { useCallback, useRef } from 'react';
import type { ComponentProps } from 'react';

import type { Sheet } from '#src/components/sheet';

export const useSheetDismissal = ({
  onDismissed,
}: Pick<ComponentProps<typeof Sheet>, 'onDismissed'>) => {
  // Completion belongs to this opening, not a later render or presentation.
  const completion = useRef<(() => void) | null>(onDismissed);
  return useCallback(() => {
    const complete = completion.current;
    completion.current = null;
    complete?.();
  }, []);
};
