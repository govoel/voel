import { useSelector } from '@tanstack/react-form';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Effect, Layer, Option, Schema } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import type { ComponentType } from 'react';
import { Pressable, Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
  useFormContext,
  useFormSubmissionError,
} from '#src/components/form/hooks.tsx';

const EmptyComponent = (() => null) satisfies ComponentType;

const runtime = Atom.runtime(Layer.empty);
const schema = Schema.Struct({ name: Schema.String });

class TestSubmitError extends Schema.TaggedErrorClass<TestSubmitError>()('TestSubmitError', {
  message: Schema.String,
}) {}

const { useAppForm } = createEffectSchemaFormHook({
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
  const validationFormError = useSelector(
    form.store,
    (state) => state.errors.find((error): error is string => typeof error === 'string') ?? null
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores a string mutation failure without invalidating the form', async () => {
    const mutation = runtime.fn((_value: typeof schema.Type) =>
      Effect.fail(new TestSubmitError({ message: 'failed' }))
    );

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        mutation,
        schema,
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
    const mutation = runtime.fn((_value: typeof schema.Type) => {
      mutationAttempts += 1;

      return mutationAttempts === 1
        ? Effect.fail(new TestSubmitError({ message: 'failed' }))
        : Effect.succeed('saved');
    });
    const onSuccess = vi.fn();

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        mutation,
        schema,
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
    const mutation = runtime.fn((_value: typeof schema.Type) =>
      Effect.fail(new TestSubmitError({ message: 'failed' }))
    );
    const onFailure = vi.fn(() => 'failed');

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        mutation,
        onSubmitMeta: { source: 'default' },
        schema,
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
    const decodedSchema = Schema.Struct({ count: Schema.NumberFromString });
    const mutation = runtime.fn((value: typeof decodedSchema.Type) =>
      Effect.succeed(value.count * 2)
    );
    const onSuccess = vi.fn();

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { count: '4' },
        mutation,
        schema: decodedSchema,
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
    const mutation = runtime.fn((_value: typeof schema.Type) => Effect.die(defect));
    const onFailure = vi.fn(() => 'mapped failure');
    const onRejected = vi.fn();

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        mutation,
        schema,
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
