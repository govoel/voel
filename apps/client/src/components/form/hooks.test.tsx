import { useSelector } from '@tanstack/react-form';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Array, Deferred, Effect, Layer, Option, Schema } from 'effect';
import { Atom } from 'effect/reactivity';
import type { ComponentType } from 'react';
import { Pressable, Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
  useFormContext,
  useFormSubmissionError,
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

const makeUser = () =>
  userEvent.setup({
    advanceTimers: async (delay) => {
      await vi.advanceTimersByTimeAsync(delay);
    },
  });

const ErrorProbe = () => {
  const form = useFormContext();
  const submissionError = useFormSubmissionError();
  const validationFormError = useSelector(form.store, (state) =>
    Option.getOrNull(
      Array.findFirst(state.errors, (error): error is string => typeof error === 'string')
    )
  );

  return (
    <Text testID="form-error">
      {Option.getOrElse(submissionError, () => validationFormError ?? 'No form error')}
    </Text>
  );
};

const RetrySubmitButton = () => {
  const form = useFormContext();
  const [canSubmit, hasSubmitValidationError] = useSelector(
    form.store,
    (state): readonly [boolean, boolean] => [state.canSubmit, state.errorMap.onSubmit !== void 0]
  );

  return (
    <>
      <Pressable
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        role="button"
        onPress={() => void form.handleSubmit()}>
        <Text>Submit</Text>
      </Pressable>
      <Text testID="can-submit">{String(canSubmit)}</Text>
      <Text testID="has-submit-validation-error">{String(hasSubmitValidationError)}</Text>
    </>
  );
};

describe('createEffectSchemaFormHook', () => {
  it('correlates concurrent forms with their own Effect results', async () => {
    vi.useRealTimers();
    const first = await Effect.runPromise(Deferred.make<string>());
    const second = await Effect.runPromise(Deferred.make<string>());
    const onFirstSuccess = vi.fn();
    const onSecondSuccess = vi.fn();
    const submit = vi.fn(({ value }: { readonly value: TestFormInput }) =>
      Deferred.await(value.name === 'first' ? first : second)
    );
    const TestForm = ({
      name,
      onSuccess,
    }: {
      readonly name: string;
      readonly onSuccess: typeof onFirstSuccess;
    }) => {
      const form = useAppForm({
        schema: TestFormInput,
        defaultValues: { name },
        onSubmit: submit,
        onFailure: () => 'Failed',
        onSuccess,
      });
      const submitting = useSelector(form.store, (state) => state.isSubmitting);
      return (
        <Pressable disabled={submitting} onPress={() => void form.handleSubmit()}>
          <Text>{submitting ? `Saving ${name}` : `Save ${name}`}</Text>
        </Pressable>
      );
    };
    await render(
      <>
        <TestForm name="first" onSuccess={onFirstSuccess} />
        <TestForm name="second" onSuccess={onSecondSuccess} />
      </>
    );
    await fireEvent.press(screen.getByText('Save first'));
    await fireEvent.press(screen.getByText('Save second'));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await Effect.runPromise(Deferred.succeed(second, 'second result'));
    });
    await waitFor(() => {
      expect(onSecondSuccess).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: { name: 'second' }, result: 'second result' })
      );
    });
    expect(onFirstSuccess).not.toHaveBeenCalled();
    expect(screen.getByText('Saving first')).toBeOnTheScreen();

    await act(async () => {
      await Effect.runPromise(Deferred.succeed(first, 'first result'));
    });
    await waitFor(() => {
      expect(onFirstSuccess).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: { name: 'first' }, result: 'first result' })
      );
    });
    expect(onSecondSuccess).toHaveBeenCalledOnce();
  });

  it('only allows schema-less forms for void-input submissions', () => {
    type DataOptions = Parameters<
      typeof useAppForm<TestFormInput, typeof TestFormInput.Encoded, undefined, never>
    >[0];
    type NoInputOptions = Parameters<typeof useAppForm<undefined, undefined, undefined, never>>[0];
    expectTypeOf<Pick<DataOptions, 'onSubmit' | 'onFailure'>>().not.toExtend<DataOptions>();
    expectTypeOf<Pick<NoInputOptions, 'onSubmit' | 'onFailure'>>().toExtend<NoInputOptions>();
  });

  it('submits void without validating TanStack values and can retry a failure', async () => {
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
    const user = makeUser();
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByTestId('form-error')).toHaveTextContent('failed');
    expect(onSuccess).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Submit' }));
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

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    await makeUser().press(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByTestId('form-error')).toHaveTextContent('failed');

    await makeUser().press(screen.getByRole('button', { name: 'Reset' }));

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
    const user = makeUser();
    const submitButton = screen.getByRole('button', { name: 'Submit' });

    await user.press(submitButton);

    expect(await screen.findByTestId('form-error')).toHaveTextContent('failed');
    expect(screen.getByTestId('can-submit')).toHaveTextContent('true');
    expect(screen.getByTestId('has-submit-validation-error')).toHaveTextContent('false');
    expect(submitButton).toBeEnabled();

    await user.press(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(mutationAttempts).toBe(2);
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
    await makeUser().press(screen.getByRole('button', { name: 'Submit' }));

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
    const mutation = (value: DecodedFormInput) => Effect.succeed(value.count * 2);
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
    await makeUser().press(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(onSuccess.mock.calls[0]?.[0]).toMatchObject({
      result: 8,
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
    await makeUser().press(screen.getByRole('button', { name: 'Submit' }));

    expect(onRejected).toHaveBeenCalledWith(defect);
    expect(onFailure).not.toHaveBeenCalled();
  });
});
