import { useSelector } from '@tanstack/react-form';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Deferred, Effect, Layer, Option, Schema } from 'effect';
import { Atom } from 'effect/reactivity';
import type { ComponentType } from 'react';
import { useReducer } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import {
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

class LookupForm extends Schema.Struct({
  name: Schema.NonEmptyString,
  lookup: Schema.Struct({ query: Schema.String.check(Schema.isNonEmpty()) }),
}) {}

class Lookup extends Schema.Struct({ query: Schema.Trim }) {}

const { AppFormGroup, useAppForm, useAppFormGroup } = createEffectSchemaFormHook({
  runtime,
  fieldComponents: { EmptyComponent },
  fieldContext,
  formComponents: { EmptyComponent },
  formContext,
});

const ErrorProbe = ({ testID = 'form-error' }: { readonly testID?: string }) => {
  const { errorMessage } = useSubmitState();
  return <Text testID={testID}>{Option.getOrElse(errorMessage, () => 'No form error')}</Text>;
};
const RetrySubmitButton = () => {
  const { submit, canSubmit, isSubmitting } = useSubmitState();
  return (
    <Pressable disabled={!canSubmit || isSubmitting} role="button" onPress={() => void submit()}>
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

  it('shows failure feedback and a saved result when a no-input submission is retried', async () => {
    let attempts = 0;
    const mutation = () => {
      attempts += 1;
      return attempts === 1
        ? TestSubmitError.make({ message: 'failed' })
        : Effect.succeed('removed');
    };
    const TestForm = () => {
      const [saved, showSaved] = useReducer(
        (_saved: string, result: string) => result,
        'Not saved'
      );
      const form = useAppForm({
        onSubmit: mutation,
        onFailure: ({ error }) => error.message,
        onSuccess: ({ value, result }) => {
          showSaved(`Submitted ${String(value)}: ${result}`);
        },
      });
      return (
        <form.AppForm>
          <RetrySubmitButton />
          <ErrorProbe />
          <Text>{saved}</Text>
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('failed')).toBeOnTheScreen();
    expect(screen.getByText('Not saved')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Submitted undefined: removed')).toBeOnTheScreen();
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

  it('submits decoded numeric input and displays the saved result', async () => {
    class DecodedFormInput extends Schema.Class<
      DecodedFormInput,
      { readonly brand: unique symbol }
    >('voel/components/form/hooks.test/DecodedFormInput')({
      count: Schema.FiniteFromString,
    }) {}
    const mutation = (value: DecodedFormInput) => Effect.succeed(value.count.toFixed(2));
    const TestForm = () => {
      const [saved, showSaved] = useReducer(
        (_saved: string, result: string) => result,
        'Not saved'
      );
      const form = useAppForm({
        defaultValues: { count: '4' },
        onSubmit: ({ value }) => mutation(value),
        schema: DecodedFormInput,
        onFailure: () => 'failed',
        onSuccess: ({ value, result }) => {
          showSaved(`${value.count}: ${result}`);
        },
      });

      return (
        <form.AppForm>
          <Pressable role="button" onPress={() => void form.handleSubmit()}>
            <Text>Submit</Text>
          </Pressable>
          <Text>{saved}</Text>
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('4: 4.00')).toBeOnTheScreen();
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

  it('submits a form group on its own, checked by the whole form’s schema', async () => {
    const lookups = vi.fn<(query: string) => void>();
    const saves = vi.fn();
    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: '', lookup: { query: '' } },
        schema: LookupForm,
        onSubmit: () => Effect.sync(saves),
        onFailure: () => 'not saved',
      });
      const group = useAppFormGroup({
        form,
        name: 'lookup',
        schema: Lookup,
        onSubmit: ({ value }) => {
          lookups(value.query);
          return value.query === 'missing'
            ? TestSubmitError.make({ message: 'not found' })
            : Effect.succeed(`Found ${value.query}`);
        },
        onFailure: ({ error }) => error.message,
        onSuccess: ({ result }) => {
          form.setFieldValue('name', result);
        },
      });
      const name = useSelector(form.store, (state) => state.values.name);
      return (
        <form.AppForm>
          <form.Field name="lookup.query">
            {(field) => (
              <TextInput
                accessibilityLabel="Query"
                value={field.state.value}
                onChangeText={field.handleChange}
              />
            )}
          </form.Field>
          <AppFormGroup group={group}>
            <RetrySubmitButton />
            <ErrorProbe testID="group-error" />
          </AppFormGroup>
          <ErrorProbe />
          <Text>Name: {name}</Text>
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.changeText(screen.getByLabelText('Query'), '');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    });

    await fireEvent.changeText(screen.getByLabelText('Query'), 'missing');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(screen.getByTestId('group-error')).toHaveTextContent('not found');
    });
    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');

    await fireEvent.changeText(screen.getByLabelText('Query'), ' films ');
    expect(screen.getByTestId('group-error')).toHaveTextContent('No form error');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Name: Found films')).toBeOnTheScreen();
    expect(lookups.mock.calls).toEqual([['missing'], ['films']]);
    expect(saves).not.toHaveBeenCalled();
  });
});
