import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Array, Deferred, Effect, Schema } from 'effect';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, expectTypeOf, it, vi } from 'vitest';

import {
  MutationConfirmation,
  MutationConfirmationProvider,
} from '#src/components/mutation-confirmation';
import type { ConfirmationComponent } from '#src/components/mutation-confirmation/confirmation';

vi.mock('@expo/ui', () => ({ Host: ({ children }: PropsWithChildren) => <View>{children}</View> }));
vi.mock('#src/components/form', async () => {
  const hooks = await import('#src/components/form/hooks.tsx');
  const { Layer } = await import('effect');
  const { Atom } = await import('effect/reactivity');
  return hooks.createEffectSchemaFormHook({
    runtime: Atom.runtime(Layer.empty),
    fieldContext: hooks.fieldContext,
    formContext: hooks.formContext,
    fieldComponents: {},
    formComponents: {},
  });
});
// Native adapter contract: the platform reports completion separately from requesting dismissal.
vi.mock('#src/components/mutation-confirmation/confirmation', () => ({
  Confirmation: (({ state, title }) => (
    <>
      <Text>{title}</Text>
      <Text>{state.feedback}</Text>
      {state.presented ? (
        <>
          <Pressable role="button" disabled={state.busy} onPress={() => void state.execute()}>
            <Text>{state.busy ? 'Working' : 'Confirm'}</Text>
          </Pressable>
          <Pressable role="button" onPress={state.handleDismiss}>
            <Text>Cancel</Text>
          </Pressable>
        </>
      ) : (
        <Pressable role="button" onPress={state.handleDismissed}>
          <Text>Finish native dismissal</Text>
        </Pressable>
      )}
    </>
  )) satisfies ConfirmationComponent,
}));

class OperationFailure extends Schema.TaggedError<
  OperationFailure,
  { readonly brand: unique symbol }
>('voel/components/mutation-confirmation/index.test/OperationFailure')('OperationFailure', {}) {}

it('reserves the host until cancellation finishes and opens the next request with fresh state', async () => {
  type ConfirmationProps = Parameters<
    typeof MutationConfirmation<Schema.Void['Type'], Record<string, never>>
  >[0];
  expectTypeOf<
    Pick<ConfirmationProps, 'onSubmit' | 'onFailure' | 'title' | 'message' | 'trigger'>
  >().toExtend<ConfirmationProps>();
  const execute = vi.fn(() => Effect.void);
  const onSuccess = vi.fn();
  const remove = () => Effect.suspend(execute);
  await render(
    <MutationConfirmationProvider>
      {Array.map(['Alice', 'Bob'], (name) => (
        <MutationConfirmation
          key={name}
          onSubmit={remove}
          title={`Remove ${name}`}
          message="Remove this account"
          onFailure={() => 'Try again'}
          onSuccess={onSuccess}
          trigger={({ open, busy }) => (
            <Pressable role="button" onPress={open}>
              <Text>{`Open ${name}`}</Text>
              <Text>{busy ? 'Busy' : 'Ready'}</Text>
            </Pressable>
          )}
        />
      ))}
    </MutationConfirmationProvider>
  );
  await fireEvent.press(screen.getByText('Open Alice'));
  expect(screen.getAllByText('Busy')).toHaveLength(2);
  await fireEvent.press(screen.getByText('Open Bob'));
  expect(screen.getByText('Remove Alice')).toBeVisible();
  expect(screen.queryByText('Remove Bob')).toBeNull();

  await fireEvent.press(screen.getByText('Cancel'));
  await fireEvent.press(screen.getByText('Open Bob'));
  expect(screen.getByText('Remove Alice')).toBeVisible();
  expect(execute).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Finish native dismissal'));
  expect(onSuccess).not.toHaveBeenCalled();
  expect(screen.getAllByText('Ready')).toHaveLength(2);

  await fireEvent.press(screen.getByText('Open Bob'));
  expect(screen.getByText('Remove Bob')).toBeVisible();
  await fireEvent.press(screen.getByText('Confirm'));
  await screen.findByText('Finish native dismissal');
  expect(execute).toHaveBeenCalledOnce();
  expect(onSuccess).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Finish native dismissal'));
  expect(onSuccess).toHaveBeenCalledOnce();
  expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ value: void 0 }));
  expect(screen.queryByText('Remove Bob')).toBeNull();
});

it('survives removal of its initiating subtree and navigates only after native dismissal', async () => {
  const completed = await Effect.runPromise(Deferred.make<undefined>());
  const remove = () => Deferred.await(completed);
  const Screen = () => {
    const [saved, setSaved] = useState(true);
    const [navigated, setNavigated] = useState(false);
    return (
      <MutationConfirmationProvider>
        <Text>{saved ? 'Saved account' : 'Inline picker available'}</Text>
        <Text>{navigated ? 'Navigated' : 'Management still mounted'}</Text>
        <Pressable
          role="button"
          onPress={() => {
            setSaved(false);
          }}>
          <Text>Account removed externally</Text>
        </Pressable>
        {saved ? (
          <MutationConfirmation
            onSubmit={remove}
            title="Remove Alice"
            message="Remove this account"
            onFailure={() => 'Try again'}
            onSuccess={() => {
              setNavigated(true);
            }}
            trigger={({ open, busy }) => (
              <Pressable role="button" disabled={busy} onPress={open}>
                <Text>Open removal</Text>
              </Pressable>
            )}
          />
        ) : null}
      </MutationConfirmationProvider>
    );
  };
  await render(<Screen />);
  await fireEvent.press(screen.getByText('Open removal'));
  await fireEvent.press(screen.getByText('Confirm'));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Working' })).toBeDisabled();
  });
  await fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByText('Finish native dismissal')).toBeNull();
  await fireEvent.press(screen.getByText('Account removed externally'));
  expect(screen.getByText('Remove Alice')).toBeVisible();
  await act(async () => {
    await Effect.runPromise(Deferred.succeed(completed, void 0));
  });
  await screen.findByText('Finish native dismissal');
  expect(screen.getByText('Management still mounted')).toBeVisible();
  await fireEvent.press(screen.getByText('Finish native dismissal'));
  expect(screen.getByText('Navigated')).toBeVisible();
  expect(screen.getByText('Inline picker available')).toBeVisible();
  expect(screen.queryByText('Remove Alice')).toBeNull();
});

it('keeps failure feedback and retry available after its trigger disappears', async () => {
  let attempts = 0;
  const remove = () =>
    Effect.suspend(() => {
      attempts += 1;
      return attempts === 1 ? OperationFailure.make({}) : Effect.void;
    });
  const Screen = () => {
    const [triggerVisible, setTriggerVisible] = useState(true);
    return (
      <MutationConfirmationProvider>
        <Pressable
          role="button"
          onPress={() => {
            setTriggerVisible(false);
          }}>
          <Text>Switch account</Text>
        </Pressable>
        {triggerVisible ? (
          <MutationConfirmation
            onSubmit={remove}
            title="Remove Alice"
            message="Remove this account"
            onFailure={() => 'Could not remove Alice. Try again.'}
            trigger={({ open }) => (
              <Pressable role="button" onPress={open}>
                <Text>Open removal</Text>
              </Pressable>
            )}
          />
        ) : null}
      </MutationConfirmationProvider>
    );
  };
  await render(<Screen />);
  await fireEvent.press(screen.getByText('Open removal'));
  await fireEvent.press(screen.getByText('Switch account'));
  await fireEvent.press(screen.getByText('Confirm'));
  await screen.findByText('Could not remove Alice. Try again.');
  await fireEvent.press(screen.getByText('Confirm'));
  await screen.findByText('Finish native dismissal');
  await fireEvent.press(screen.getByText('Finish native dismissal'));
  expect(screen.queryByText('Remove Alice')).toBeNull();
});
