import { Option } from 'effect';
import { useRef } from 'react';
import type { ComponentProps } from 'react';

import type { Sheet } from '#src/components/sheet';

export const useSheetDismissal = ({
  onDismissed,
}: Pick<ComponentProps<typeof Sheet>, 'onDismissed'>) => {
  const completion = useRef<Option.Option<typeof onDismissed>>(Option.some(onDismissed));
  return () => {
    const complete = completion.current;
    completion.current = Option.none();
    Option.match(complete, {
      onNone: () => void 0,
      onSome: (callback) => {
        callback();
      },
    });
  };
};
