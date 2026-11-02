import { useSelector } from '@tanstack/react-form';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Layer, Option, Schema } from 'effect';
import { Atom } from 'effect/reactivity';
import type { ComponentType } from 'react';
import { useReducer } from 'react';
import { Pressable, Text } from 'react-native';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  NoFormInput,
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
  useSubmitState,
} from '#src/components/form/hooks.tsx';

const EmptyComponent = (() => null) satisfies ComponentType;

const runtime = Atom.runtime(Layer.empty);
class TestFormInput extends Schema.Class<TestFormInput, { readonly brand: unique symbol }>(
  'voel/components/form/hooks.test/TestFormInput'
)({
  name: Schema.String,
}) {}

class TestSubmitError extends Schema.TaggedError<
  TestSubmitError,
  { readonly brand: unique symbol }
>('voel/components/form/hooks.test/TestSubmitError')('TestSubmitError', {
  message: Schema.String,
}) {}

const { useAppForm } = createEffectSchemaFormHook({
  runtime,
  fieldComponents: { EmptyComponent },
  fieldContext,
  formComponents: { EmptyComponent },
  formContext,
});

const ErrorProbe = () => {
  const { errorMessage } = useSubmitState();
  return <Text testID="form-error">{Option.getOrElse(errorMessage, () => 'No form error')}</Text>;
};
const RetrySubmitButton = () => {
  const { form, canSubmit, isSubmitting } = useSubmitState();
  return (
    <Pressable
      disabled={!canSubmit || isSubmitting}
      role="button"
      onPress={() => void form.handleSubmit()}>
      <Text>Submit</Text>
    </Pressable>
  );
};

describe('createEffectSchemaFormHook', () => {
  it('shows each concurrent form its own saved result', async () => {
    const first = await Effect.runPromise(Deferred.make<string>());
    const second = await Effect.runPromise(Deferred.make<string>());
    const submit = ({ value }: { readonly value: TestFormInput }) =>
      Deferred.await(value.name === 'first' ? first : second);
    const TestForm = ({ name }: { readonly name: string }) => {
      const [saved, showSaved] = useReducer((_saved: string, result: string) => result, '');
      const form = useAppForm({
        schema: TestFormInput,
        defaultValues: { name },
        onSubmit: submit,
        onFailure: () => 'Failed',
        onSuccess: ({ result }) => {
          showSaved(result);
        },
      });
      const submitting = useSelector(form.store, (state) => state.isSubmitting);
      return (
        <>
          <Pressable role="button" disabled={submitting} onPress={() => void form.handleSubmit()}>
            <Text>{name}</Text>
          </Pressable>
          <Text>
            {name}: {saved}
          </Text>
        </>
      );
    };
    await render(
      <>
        <TestForm name="first" />
        <TestForm name="second" />
      </>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'first' }));
    await fireEvent.press(screen.getByRole('button', { name: 'second' }));
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(second, 'Second saved'));
    });
    await screen.findByText('second: Second saved');
    expect(screen.getByRole('button', { name: 'first' })).toBeDisabled();
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(first, 'First saved'));
    });
    await screen.findByText('first: First saved');
    expect(screen.getByText('second: Second saved')).toBeOnTheScreen();
  });

  it('requires a schema for data and no-input submissions', () => {
    type DataOptions = Parameters<
      typeof useAppForm<TestFormInput, typeof TestFormInput.Encoded>
    >[0];
    type NoInputOptions = Parameters<
      typeof useAppForm<typeof NoFormInput.Type, typeof NoFormInput.Encoded>
    >[0];
    expectTypeOf<Omit<DataOptions, 'schema'>>().not.toExtend<DataOptions>();
    expectTypeOf<Omit<NoInputOptions, 'schema'>>().not.toExtend<NoInputOptions>();
  });

  it('decodes empty TanStack values to void and can retry a failure', async () => {
    expect(await Effect.runPromise(Schema.encodeEffect(NoFormInput)(void 0))).toEqual({});
    const inputs: Array<void> = [];
    const mutation = (input: Schema.Void['Type']) => {
      inputs.push(input);
      return inputs.length === 1
        ? TestSubmitError.make({ message: 'failed' })
        : Effect.succeed('removed');
    };
    const onSuccess = vi.fn();

    const TestForm = () => {
      const form = useAppForm({
        schema: NoFormInput,
        onSubmit: ({ value }) => mutation(value),
        onFailure: ({ error }) => error.message,
        onSuccess,
      });
      return (
        <form.AppForm>
          <RetrySubmitButton />
          <ErrorProbe />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('failed')).toBeOnTheScreen();
    expect(onSuccess).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(inputs).toEqual([void 0, void 0]);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        value: void 0,
        result: 'removed',
      })
    );
    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');
  });

  it('stores a string mutation failure without invalidating the form', async () => {
    const failure = TestSubmitError.make({ message: 'failed' });
    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        onSubmit: () => failure,
        schema: TestFormInput,
        onFailure: ({ error }) => error.message,
      });

      return (
        <form.AppForm>
          <Pressable role="button" onPress={() => void form.handleSubmit()}>
            <Text>Submit</Text>
          </Pressable>
          <Pressable
            role="button"
            onPress={() => {
              form.reset();
            }}>
            <Text>Reset</Text>
          </Pressable>
          <ErrorProbe />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText('failed');

    await fireEvent.press(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');
    });
  });

  it('can retry after a failed submission and then submit successfully', async () => {
    let mutationAttempts = 0;
    const mutation = (_value: TestFormInput) => {
      mutationAttempts += 1;

      return mutationAttempts === 1
        ? TestSubmitError.make({ message: 'failed' })
        : Effect.succeed('saved');
    };
    const onSuccess = vi.fn();

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        onSubmit: ({ value }) => mutation(value),
        schema: TestFormInput,
        onFailure: ({ error }) => error.message,
        onSuccess,
      });

      return (
        <form.AppForm>
          <RetrySubmitButton />
          <ErrorProbe />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    const submitButton = screen.getByRole('button', { name: 'Submit' });

    await fireEvent.press(submitButton);

    await screen.findByText('failed');
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    await fireEvent.press(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');
  });

  it('passes per-submit metadata to onFailure', async () => {
    const onFailure = vi.fn(() => 'failed');

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        onSubmit: () => TestSubmitError.make({ message: 'failed' }),
        onSubmitMeta: { source: 'default' },
        schema: TestFormInput,
        onFailure,
      });

      return (
        <form.AppForm>
          <Pressable role="button" onPress={() => void form.handleSubmit({ source: 'button' })}>
            <Text>Submit</Text>
          </Pressable>
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onFailure).toHaveBeenCalledWith(
        expect.objectContaining({ meta: { source: 'button' }, value: { name: 'ok' } })
      );
    });
  });

  it('passes the decoded value and mutation result to onSuccess', async () => {
    class DecodedFormInput extends Schema.Class<
      DecodedFormInput,
      { readonly brand: unique symbol }
    >('voel/components/form/hooks.test/DecodedFormInput')({
      count: Schema.FiniteFromString,
    }) {}
    const mutation = (value: DecodedFormInput) => Effect.succeed(value.count.toFixed(2));
    const onSuccess = vi.fn();

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { count: '4' },
        onSubmit: ({ value }) => mutation(value),
        schema: DecodedFormInput,
        onFailure: () => 'failed',
        onSuccess,
      });

      return (
        <form.AppForm>
          <Pressable role="button" onPress={() => void form.handleSubmit()}>
            <Text>Submit</Text>
          </Pressable>
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(onSuccess.mock.calls[0]?.[0]).toMatchObject({
      result: '4.00',
      value: { count: 4 },
    });
  });

  it('propagates mutation defects without passing them to onFailure', async () => {
    const defect = new Error('mutation defect');
    const mutation = (_value: TestFormInput) => Effect.die(defect);
    const onFailure = vi.fn(() => 'mapped failure');
    const onRejected = vi.fn();

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        onSubmit: ({ value }) => mutation(value),
        schema: TestFormInput,
        onFailure,
      });

      return (
        <form.AppForm>
          <Pressable
            role="button"
            onPress={() => {
              void form.handleSubmit().catch(onRejected);
            }}>
            <Text>Submit</Text>
          </Pressable>
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onRejected).toHaveBeenCalledWith(defect);
    });
    expect(onFailure).not.toHaveBeenCalled();
  });
});
