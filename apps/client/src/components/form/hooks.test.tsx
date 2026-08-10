import { useSelector } from '@tanstack/react-form';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Effect, Layer, Schema } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import type { ComponentType } from 'react';
import { Pressable, Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FormFieldError } from '#src/components/form/hooks.tsx';
import {
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
  getFormFieldErrorMessage,
  useFormContext,
} from '#src/components/form/hooks.tsx';
import { canSubmitOrRetry } from '#src/components/form/submit-button/index.ts';

const EmptyComponent = (() => null) satisfies ComponentType;

const runtime = Atom.runtime(Layer.empty);
const schema = Schema.Struct({ name: Schema.String });

class TestSubmitError extends Schema.TaggedError<TestSubmitError>()('TestSubmitError', {
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
  const [formError, fieldError] = useSelector(
    form.store,
    (state): readonly [string | null, string | null] => {
      const nextFormError = state.errors.find(
        (error): error is string => typeof error === 'string'
      );
      const nextFieldError = (
        state.fieldMeta as Record<string, { readonly errors: Array<FormFieldError> }>
      )['name']?.errors[0];

      return [
        nextFormError ?? null,
        nextFieldError === void 0 ? null : getFormFieldErrorMessage(nextFieldError),
      ];
    }
  );

  return (
    <>
      <Text testID="form-error">{formError ?? 'No form error'}</Text>
      <Text testID="field-error">{fieldError ?? 'No field error'}</Text>
    </>
  );
};

const RetrySubmitButton = () => {
  const form = useFormContext();
  const [canSubmit, canSubmitWithoutRetry] = useSelector(
    form.store,
    (state): readonly [boolean, boolean] => [canSubmitOrRetry(state), state.canSubmit]
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
      <Text testID="can-submit">{String(canSubmitWithoutRetry)}</Text>
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

  it('stores a string mutation failure as a native form error', async () => {
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
          <ErrorProbe />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await makeUser().press(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByTestId('form-error')).toHaveTextContent('failed');
  });

  it('stores mapped mutation failures on the form and fields', async () => {
    const mutation = runtime.fn((_value: typeof schema.Type) =>
      Effect.fail(new TestSubmitError({ message: 'failed' }))
    );

    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: 'ok' },
        mutation,
        schema,
        onFailure: () => ({
          form: 'Invalid account',
          fields: { name: 'Name is already taken' },
        }),
      });

      return (
        <form.AppForm>
          <form.AppField name="name">{(field) => <field.EmptyComponent />}</form.AppField>
          <Pressable role="button" onPress={() => void form.handleSubmit()}>
            <Text>Submit</Text>
          </Pressable>
          <ErrorProbe />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await makeUser().press(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByTestId('form-error')).toHaveTextContent('Invalid account');
    expect(screen.getByTestId('field-error')).toHaveTextContent('Name is already taken');
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
    expect(screen.getByTestId('can-submit')).toHaveTextContent('false');
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
