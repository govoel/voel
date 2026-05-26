import { Button } from '@expo/ui/swift-ui';
import { disabled as disabledModifier } from '@expo/ui/swift-ui/modifiers';
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
      {...('ios' in platformProps ? platformProps.ios : {})}
      modifiers={[
        ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
        disabledModifier(!canSubmit || isSubmitting || disabled),
      ]}
      onPress={() => {
        void form.handleSubmit();
      }}>
      {children}
    </Button>
  );
}) satisfies SubmitButtonComponent;
