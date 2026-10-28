import { Option } from 'effect';
import { useCallback, useRef } from 'react';
import type { ComponentProps } from 'react';

import type { Sheet } from '#src/components/sheet';

export const useSheetDismissal = ({
  onDismissed,
}: Pick<ComponentProps<typeof Sheet>, 'onDismissed'>) => {
  // Completion belongs to this opening, not a later render or presentation.
  const completion = useRef<Option.Option<typeof onDismissed>>(Option.some(onDismissed));
  return useCallback(() => {
    const complete = completion.current;
    completion.current = Option.none();
    Option.match(complete, {
      onNone: () => void 0,
      onSome: (callback) => {
        callback();
      },
    });
  }, []);
};
