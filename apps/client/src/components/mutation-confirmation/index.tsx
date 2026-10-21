import { Host } from '@expo/ui';
import { Option } from 'effect';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import type { ComponentProps, PropsWithChildren, ReactElement } from 'react';

import { useAppForm } from '#src/components/form';
import { useSubmitState } from '#src/components/form/hooks.tsx';
import { Confirmation } from '#src/components/mutation-confirmation/confirmation';

type PresentationProps = Omit<ComponentProps<typeof Confirmation>, 'state'> & {
  readonly trigger: (state: { readonly open: () => void; readonly busy: boolean }) => ReactElement;
};

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
}: Parameters<typeof useAppForm<Input, Encoded, Success, Failure, EncodingServices>>[0] &
  Omit<ComponentProps<typeof Confirmation>, 'state'> & { readonly dismiss: () => void }) => {
  const [presentation, setPresentation] = useState<
    | { readonly tag: 'presented' }
    | { readonly tag: 'closing'; readonly onDismissed?: () => void | Promise<void> }
  >({ tag: 'presented' });
  const dismissed = useRef(false);
  const form = useAppForm({
    ...props,
    onSuccess: (result) => {
      setPresentation({
        tag: 'closing',
        onDismissed: async () => props.onSuccess?.(result),
      });
    },
  });
  return (
    <form.AppForm>
      <ConfirmationForm
        {...props}
        presented={presentation.tag === 'presented'}
        onDismiss={() => {
          setPresentation((current) => (current.tag === 'closing' ? current : { tag: 'closing' }));
        }}
        onDismissed={() => {
          if (dismissed.current) {
            return;
          }
          dismissed.current = true;
          // Navigation may remove the host too. Only run it after native dismissal completes.
          dismiss();
          if (presentation.tag === 'closing') {
            void presentation.onDismissed?.();
          }
        }}
      />
    </form.AppForm>
  );
};

export const MutationConfirmation = <Input, Encoded, Success, Failure, EncodingServices = never>({
  trigger,
  ...props
}: Parameters<typeof useAppForm<Input, Encoded, Success, Failure, EncodingServices>>[0] &
  PresentationProps) => {
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
