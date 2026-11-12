import { useSelector } from '@tanstack/react-form';
import { usePreventRemove, useRouter } from 'expo-router';
import { useState } from 'react';

import type { LibraryEditor } from '#src/components/library-editor/use-editor.ts';

export const useEditorNavigation = ({ editor }: { readonly editor: LibraryEditor }) => {
  const router = useRouter();
  const dirty = useSelector(editor.form.store, (state) => state.isDirty);
  const [leaving, setLeaving] = useState(false);
  const [exit, setExit] = useState<(() => void) | null>(null);
  const disablePrevention = usePreventRemove(
    (dirty || editor.submitting) && !leaving,
    ({ repeat }) => {
      if (editor.completed.current) {
        setLeaving(true);
        repeat();
      } else if (!editor.submitting) {
        setExit(() => repeat);
      }
    }
  );
  const leave = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/accounts/server/libraries');
    }
  };
  return {
    discarding: exit !== null,
    handleClose: () => {
      if (editor.submitting) {
        return;
      }
      if (dirty) {
        setExit(() => leave);
      } else {
        setLeaving(true);
        disablePrevention();
        leave();
      }
    },
    cancelDiscard: () => {
      setExit(null);
    },
    discard: () => {
      setLeaving(true);
      disablePrevention();
      exit?.();
      setExit(null);
    },
  };
};
