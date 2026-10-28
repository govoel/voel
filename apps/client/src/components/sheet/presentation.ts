import { useCallback, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

import type { Sheet } from '#src/components/sheet';

export const useSheetPresentation = ({
  onDismissed,
}: Pick<ComponentProps<typeof Sheet>, 'onDismissed'>) => {
  const [presented, setPresented] = useState(true);
  // Completion belongs to this opening, not a later render or presentation.
  const completion = useRef<(() => void) | null>(onDismissed);
  const dismiss = useCallback(() => {
    setPresented(false);
  }, []);
  const handleDismissed = useCallback(() => {
    const complete = completion.current;
    completion.current = null;
    complete?.();
  }, []);
  return { presented, dismiss, handleDismissed };
};
