import { Option } from 'effect';
import { useState } from 'react';
import type { ComponentProps, ReactElement } from 'react';

import { Confirmation } from '#src/components/confirmation';
import { useAppForm } from '#src/components/form';
import { useSubmitState } from '#src/components/form/hooks.tsx';

type PresentationProps = Omit<ComponentProps<typeof Confirmation>, 'state' | 'trigger'> & {
  readonly trigger: (state: { readonly open: () => void; readonly busy: boolean }) => ReactElement;
};

const ConfirmationForm = ({
  presented,
  setPresented,
  trigger,
  ...props
}: PresentationProps & {
  readonly presented: boolean;
  readonly setPresented: (presented: boolean) => void;
}) => {
  const { form, isSubmitting, errorMessage } = useSubmitState();
  return (
    <Confirmation
      {...props}
      trigger={trigger({
        busy: isSubmitting,
        open: () => {
          form.reset();
          setPresented(true);
        },
      })}
      state={{
        presented,
        busy: isSubmitting,
        feedback: Option.getOrElse(errorMessage, () => ''),
        execute: async () => form.handleSubmit(),
        handleDismiss: () => {
          if (!isSubmitting) {
            setPresented(false);
          }
        },
      }}
    />
  );
};

export const MutationConfirmation = <Input, Encoded, Success, Failure, EncodingServices = never>(
  props: Parameters<typeof useAppForm<Input, Encoded, Success, Failure, EncodingServices>>[0] &
    PresentationProps
) => {
  const [presented, setPresented] = useState(false);
  const form = useAppForm({
    ...props,
    onSuccess: async (result) => {
      setPresented(false);
      await props.onSuccess?.(result);
    },
  });
  return (
    <form.AppForm>
      <ConfirmationForm {...props} presented={presented} setPresented={setPresented} />
    </form.AppForm>
  );
};
