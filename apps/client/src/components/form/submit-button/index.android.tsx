import { Button } from '@expo/ui/jetpack-compose';
import { useStore } from '@tanstack/react-form';

import { useFormContext } from '#src/components/form/hooks.ts';
import type { SubmitButtonComponent } from '#src/components/form/submit-button';

export const SubmitButton = (({ children, disabled = false, platformProps = {} }) => {
  const form = useFormContext();
  const [canSubmit, isSubmitting] = useStore(form.store, (state) => [
    state.canSubmit,
    state.isSubmitting,
  ]);

  return (
    <Button
      {...('android' in platformProps ? platformProps.android : {})}
      enabled={canSubmit && !isSubmitting && !disabled}
      onClick={() => {
        void form.handleSubmit();
      }}>
      {children}
    </Button>
  );
}) satisfies SubmitButtonComponent;
