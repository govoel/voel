import { Host } from '@expo/ui';
import { Option } from 'effect';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import type { ComponentProps, PropsWithChildren, ReactElement } from 'react';

import { useAppForm } from '#src/components/form';
import { useSubmitState } from '#src/components/form/hooks.tsx';
import { Confirmation } from '#src/components/mutation-confirmation/confirmation';

type MutationProps<Input, Encoded, Success, Failure, EncodingServices> = Parameters<
  typeof useAppForm<Input, Encoded, Success, Failure, EncodingServices>
>[0] &
  Omit<ComponentProps<typeof Confirmation>, 'state'>;

const PresentationContext = createContext<{
  readonly busy: boolean;
  readonly present: (render: (dismiss: () => void) => ReactElement) => void;
} | null>(null);

/** Native presentations belong to management, not the account subtree a mutation can remove. */
export const MutationConfirmationProvider = ({ children }: PropsWithChildren) => {
  const [content, setContent] = useState<ReactElement | null>(null);
  const value = useMemo(
    () => ({
      busy: content !== null,
      present: (render: (dismiss: () => void) => ReactElement) => {
        setContent(
          (current) =>
            current ??
            render(() => {
              setContent(null);
            })
        );
      },
    }),
    [content]
  );
  return (
    <PresentationContext.Provider value={value}>
      {children}
      <Host style={{ position: 'absolute', width: 0, height: 0 }}>{content}</Host>
    </PresentationContext.Provider>
  );
};

const ConfirmationForm = ({
  presented,
  onDismissed,
  onDismiss,
  ...props
}: Omit<ComponentProps<typeof Confirmation>, 'state'> & {
  readonly presented: boolean;
  readonly onDismissed: () => void;
  readonly onDismiss: () => void;
}) => {
  const { form, isSubmitting, errorMessage } = useSubmitState();
  return (
    <Confirmation
      {...props}
      state={{
        presented,
        busy: isSubmitting,
        feedback: Option.getOrElse(errorMessage, () => ''),
        execute: form.handleSubmit,
        handleDismiss: () => {
          if (!isSubmitting) {
            onDismiss();
          }
        },
        handleDismissed: onDismissed,
      }}
    />
  );
};

const PresentedMutation = <Input, Encoded, Success, Failure, EncodingServices = never>({
  dismiss,
  ...props
}: MutationProps<Input, Encoded, Success, Failure, EncodingServices> & {
  readonly dismiss: () => void;
}) => {
  const [presented, setPresented] = useState(true);
  const completeDismissal = useRef<(() => void) | null>(dismiss);
  const form = useAppForm({
    ...props,
    onSuccess: (result) => {
      // Navigation may remove the host too. Wait until native dismissal completes.
      completeDismissal.current = () => {
        dismiss();
        void props.onSuccess?.(result);
      };
      setPresented(false);
    },
  });
  return (
    <form.AppForm>
      <ConfirmationForm
        {...props}
        presented={presented}
        onDismiss={() => {
          setPresented(false);
        }}
        onDismissed={() => {
          // Native adapters can report completion more than once. Consume it once.
          const complete = completeDismissal.current;
          completeDismissal.current = null;
          complete?.();
        }}
      />
    </form.AppForm>
  );
};

export const MutationConfirmation = <Input, Encoded, Success, Failure, EncodingServices = never>({
  trigger,
  ...props
}: MutationProps<Input, Encoded, Success, Failure, EncodingServices> & {
  readonly trigger: (state: { readonly open: () => void; readonly busy: boolean }) => ReactElement;
}) => {
  const presentation = useContext(PresentationContext);
  if (presentation === null) {
    throw new Error('MutationConfirmation requires MutationConfirmationProvider');
  }
  return trigger({
    busy: presentation.busy,
    open: () => {
      // Capture the request (including its account-bound atom) when the user opens it.
      presentation.present((dismiss) => <PresentedMutation {...props} dismiss={dismiss} />);
    },
  });
};
