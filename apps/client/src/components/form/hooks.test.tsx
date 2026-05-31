import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Layer, ManagedRuntime, Schema } from 'effect';
import type { ComponentType } from 'react';
import { Pressable, Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FormSubmitError,
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
  useFormSubmitError,
} from '#src/components/form/hooks.ts';

const EmptyComponent = (() => null) satisfies ComponentType;

const runtime = ManagedRuntime.make(Layer.empty);
const schema = Schema.Struct({ name: Schema.String });

const { useAppForm } = createEffectSchemaFormHook({
  fieldComponents: { EmptyComponent },
  fieldContext,
  formComponents: { EmptyComponent },
  formContext,
});

const submitFailureAfter = (deferred: Deferred.Deferred<null>, message: string) =>
  Deferred.await(deferred).pipe(
    Effect.flatMap(() => Effect.fail(new FormSubmitError({ message })))
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

const ErrorProbe = () => {
  const submitError = useFormSubmitError();
  return <Text role="alert">{submitError?.message ?? 'No submit error'}</Text>;
};

const renderSubmitRaceForm = async (
  submitResults: readonly ReturnType<typeof makeSubmitResult>[]
) => {
  const submits: Promise<unknown>[] = [];
  let submitIndex = 0;

  const TestForm = () => {
    const form = useAppForm({
      defaultValues: { name: 'ok' },
      runtime,
      schema,
      onSubmit: () => {
        const result = submitResults[submitIndex];
        submitIndex += 1;

        if (result === void 0) {
          throw new Error('Unexpected submit');
        }

        return submitFailureAfter(result.deferred, result.message);
      },
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
    user: userEvent.setup({
      advanceTimers: async (delay) => {
        await vi.advanceTimersByTimeAsync(delay);
      },
    }),
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

  it('does not restore a stale submit error after reset', async () => {
    const staleResult = makeSubmitResult('stale submit error');
    const form = await renderSubmitRaceForm([staleResult]);

    await form.user.press(form.submitButton());
    await form.waitForSubmitCount(1);

    await form.user.press(form.resetButton());

    await completeSubmit(staleResult, form.submitAt(0));

    expect(screen.queryByText('stale submit error')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('No submit error');
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

    expect(await screen.findByRole('alert', { name: 'new submit error' })).toBeOnTheScreen();

    await completeSubmit(oldResult, form.submitAt(0));

    expect(screen.queryByText('old submit error')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('new submit error');
  });
});
