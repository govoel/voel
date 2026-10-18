import { ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { Effect } from 'effect';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { ControlledSheetComponent } from '#src/components/controlled-sheet';


export const ControlledSheet = ({
  presented,
  onDismissRequest,
  children,
}: ComponentProps<ControlledSheetComponent>) => {
  const sheet = useRef<ModalBottomSheetRef>(null);
  const [host, setHost] = useState<{
    key: number;
    status: 'absent' | 'visible' | 'hiding';
  }>({ key: 0, status: presented ? 'visible' : 'absent' });

  if (host.status === 'absent' && presented) {
    setHost({ ...host, status: 'visible' });
  } else if (host.status === 'visible' && !presented) {
    setHost({ ...host, status: 'hiding' });
  }

  useEffect(() => {
    if (host.status !== 'hiding') {
      return void 0;
    }
    let mounted = true;

    // Only this host's hide owns its release; reopening waits for a fresh native host.
    const hide = async () => {
      try {
        await sheet.current?.hide();
      } catch (error) {
        Effect.runSync(Effect.logWarning('Unable to animate sheet dismissal', error));
      }
      if (mounted) {
        setHost({ key: host.key + 1, status: 'absent' });
      }
    };
    void hide();
    return () => {
      mounted = false;
    };
  }, [host]);

  return host.status !== 'absent' ? (
    <ModalBottomSheet
      key={host.key}
      ref={sheet}
      skipPartiallyExpanded
      onDismissRequest={() => {
        if (host.status === 'visible' && presented) {
          onDismissRequest();
        }
      }}>
      {host.status === 'visible' && presented ? children({ close: onDismissRequest }) : null}
    </ModalBottomSheet>
  ) : null;
};
