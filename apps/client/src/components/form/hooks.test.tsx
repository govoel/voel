import { useSelector } from '@tanstack/react-form';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Layer, Schema } from 'effect';
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

const submitFailureAfter = (deferred: Deferred.Deferred<null>, message: string) =>
  Deferred.await(deferred).pipe(
    Effect.flatMap(() => Effect.fail(new TestSubmitError({ message })))
  );

const makeSubmitResult = (message: string) => ({
  deferred: Effect.runSync(Deferred.make<null>()),
  message,
});

const completeSubmit = async (
  result: ReturnType<typeof makeSubmitResult>,
  submit: Promise<unknown>
) => {
  await act(async () => {
    Effect.runSync(Deferred.succeed(result.deferred, null));
    await submit;
  });
};

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
        state.fieldMeta as Record<string, { readonly errors: FormFieldError[] }>
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

const renderSubmitRaceForm = async (
  submitResults: readonly ReturnType<typeof makeSubmitResult>[]
) => {
  const submits: Promise<unknown>[] = [];
  let submitIndex = 0;
  const mutation = runtime.fn((_value: typeof schema.Type) => {
    const result = submitResults[submitIndex];
    submitIndex += 1;

    if (result === void 0) {
      return Effect.die(new Error('Unexpected submit'));
    }

    return submitFailureAfter(result.deferred, result.message);
  });

  const TestForm = () => {
    const form = useAppForm({
      defaultValues: { name: 'ok' },
      mutation,
      schema,
      onFailure: ({ error }) => error.message,
    });

    return (
      <form.AppForm>
        <Pressable
          role="button"
          onPress={() => {
            submits.push(form.handleSubmit());
          }}>
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

  return {
    resetButton: () => screen.getByRole('button', { name: 'Reset' }),
    submitAt: async (index: number) => {
      const submit = submits[index];

      if (submit === void 0) {
        throw new Error(`Missing submit at index ${index}`);
      }

      return submit;
    },
    submitButton: () => screen.getByRole('button', { name: 'Submit' }),
    user: makeUser(),
    waitForSubmitCount: async (count: number) => {
      await waitFor(() => {
        expect(submitIndex).toBe(count);
      });
    },
  };
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

  it('does not restore a stale submit error after reset', async () => {
    const staleResult = makeSubmitResult('stale submit error');
    const form = await renderSubmitRaceForm([staleResult]);

    await form.user.press(form.submitButton());
    await form.waitForSubmitCount(1);

    await form.user.press(form.resetButton());

    await completeSubmit(staleResult, form.submitAt(0));

    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');
  });

  it('keeps the newer submit error when an older reset submit resolves later', async () => {
    const oldResult = makeSubmitResult('old submit error');
    const newResult = makeSubmitResult('new submit error');
    const form = await renderSubmitRaceForm([oldResult, newResult]);

    await form.user.press(form.submitButton());
    await form.waitForSubmitCount(1);

    await form.user.press(form.resetButton());

    await form.user.press(form.submitButton());
    await form.waitForSubmitCount(2);

    await completeSubmit(newResult, form.submitAt(1));

    expect(await screen.findByTestId('form-error')).toHaveTextContent('new submit error');

    await completeSubmit(oldResult, form.submitAt(0));

    expect(screen.getByTestId('form-error')).toHaveTextContent('new submit error');
  });
});
