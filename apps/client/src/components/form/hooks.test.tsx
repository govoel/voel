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
  useTextFieldState,
} from '#src/components/form/hooks.tsx';

const EmptyComponent = (() => null) satisfies ComponentType;

const TestTextField = ({ label }: { readonly label: string }) => {
  const { field, isSubmitting, errorMessage } = useTextFieldState();
  return (
    <>
      <TextInput
        accessibilityLabel={label}
        editable={!isSubmitting}
        value={field.state.value}
        onChangeText={field.handleChange}
      />
      <Text>{Option.getOrElse(errorMessage, () => '')}</Text>
    </>
  );
};

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

const { useAppForm, useAppFormGroup } = createEffectSchemaFormHook({
  runtime,
  fieldComponents: { EmptyComponent, TestTextField },
  fieldContext,
  formComponents: { EmptyComponent },
  formContext,
});

const ErrorProbe = ({
  testID = 'form-error',
  group,
}: NonNullable<Parameters<typeof useSubmitState>[0]> & { readonly testID?: string }) => {
  const { errorMessage } = useSubmitState({ group });
  return <Text testID={testID}>{Option.getOrElse(errorMessage, () => 'No form error')}</Text>;
};
const RetrySubmitButton = ({ group }: NonNullable<Parameters<typeof useSubmitState>[0]>) => {
  const { submit, canSubmit, isSubmitting } = useSubmitState({ group });
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
          <form.AppField name="lookup.query">
            {(field) => <field.TestTextField label="Query" />}
          </form.AppField>
          <RetrySubmitButton group={group} />
          <ErrorProbe testID="group-error" group={group} />
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

  it('validates the group schema even when the parent accepts the input', async () => {
    class PermissiveLookupForm extends Schema.Struct({
      name: Schema.NonEmptyString,
      lookup: Schema.Struct({ query: Schema.String }),
    }) {}
    class RequiredLookup extends Schema.Struct({
      query: Schema.String.check(Schema.isNonEmpty({ message: 'Enter a query' })),
    }) {}
    const submitted = vi.fn();
    const failed = vi.fn(() => 'not found');
    const rejected = vi.fn();
    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: '', lookup: { query: '' } },
        schema: PermissiveLookupForm,
        onSubmit: () => Effect.void,
        onFailure: () => 'not saved',
      });
      const group = useAppFormGroup({
        form,
        name: 'lookup',
        schema: RequiredLookup,
        onSubmit: ({ value }) =>
          Effect.sync(() => {
            submitted(value);
          }),
        onFailure: failed,
      });
      return (
        <form.AppForm>
          <form.AppField name="lookup.query">
            {(field) => <field.TestTextField label="Query" />}
          </form.AppField>
          <Pressable role="button" onPress={async () => group.handleSubmit().catch(rejected)}>
            <Text>Validate lookup</Text>
          </Pressable>
          <RetrySubmitButton group={group} />
          <ErrorProbe group={group} />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Validate lookup' }));
    expect(await screen.findByText('Enter a query')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(submitted).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');

    await fireEvent.changeText(screen.getByLabelText('Query'), 'films');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(submitted).toHaveBeenCalledExactlyOnceWith({ query: 'films' });
    });
  });

  it('clears every scoped submission error when the parent is reset', async () => {
    class GroupedForm extends Schema.Struct({ first: Lookup, second: Lookup }) {}
    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { first: { query: 'first' }, second: { query: 'second' } },
        schema: GroupedForm,
        onSubmit: () => TestSubmitError.make({ message: 'form failed' }),
        onFailure: ({ error }) => error.message,
      });
      const first = useAppFormGroup({
        form,
        name: 'first',
        schema: Lookup,
        onSubmit: () => TestSubmitError.make({ message: 'first failed' }),
        onFailure: ({ error }) => error.message,
      });
      const second = useAppFormGroup({
        form,
        name: 'second',
        schema: Lookup,
        onSubmit: () => TestSubmitError.make({ message: 'second failed' }),
        onFailure: ({ error }) => error.message,
      });
      return (
        <form.AppForm>
          <Pressable role="button" onPress={async () => first.handleSubmit()}>
            <Text>First</Text>
          </Pressable>
          <Pressable role="button" onPress={async () => second.handleSubmit()}>
            <Text>Second</Text>
          </Pressable>
          <Pressable role="button" onPress={async () => form.handleSubmit()}>
            <Text>Form</Text>
          </Pressable>
          <Pressable
            role="button"
            onPress={() => {
              form.reset();
            }}>
            <Text>Reset</Text>
          </Pressable>
          <ErrorProbe />
          <ErrorProbe group={first} testID="first-error" />
          <ErrorProbe group={second} testID="second-error" />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'First' }));
    expect(await screen.findByText('first failed')).toBeOnTheScreen();
    expect(screen.getByTestId('second-error')).toHaveTextContent('No form error');
    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');
    await fireEvent.press(screen.getByRole('button', { name: 'Second' }));
    expect(await screen.findByText('second failed')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Form' }));
    expect(await screen.findByText('form failed')).toBeOnTheScreen();
    expect(screen.getByText('first failed')).toBeOnTheScreen();
    expect(screen.getByText('second failed')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Reset' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reset' }));
    for (const testID of ['form-error', 'first-error', 'second-error']) {
      expect(screen.getByTestId(testID)).toHaveTextContent('No form error');
    }
    // The values never changed, so clearing errors must not rely on change listeners.
    await fireEvent.press(screen.getByRole('button', { name: 'First' }));
    expect(await screen.findByText('first failed')).toBeOnTheScreen();
    expect(screen.getByTestId('second-error')).toHaveTextContent('No form error');
    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');
  });

  it('preserves group context and metadata in submission, failure, and success callbacks', async () => {
    const submitted = vi.fn();
    const failed = vi.fn();
    const succeeded = vi.fn();
    const groupContexts = new Set<unknown>();
    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: '', lookup: { query: ' films ' } },
        schema: LookupForm,
        onSubmitMeta: { parentOnly: true },
        onSubmit: () => Effect.void,
        onFailure: () => 'not saved',
      });
      const group = useAppFormGroup({
        form,
        name: 'lookup',
        schema: Lookup,
        onSubmitMeta: { source: 'default' },
        onSubmit: (props) => {
          groupContexts.add(props.groupApi);
          submitted(props);
          return props.meta.source === 'default'
            ? TestSubmitError.make({ message: 'not found' })
            : Effect.succeed('found');
        },
        onFailure: (props) => {
          groupContexts.add(props.groupApi);
          failed(props);
          return props.error.message;
        },
        onSuccess: (props) => {
          groupContexts.add(props.groupApi);
          succeeded(props);
          props.groupApi.setFieldValue(
            'name',
            `${props.result}: ${props.value.query} (${props.meta.source})`
          );
        },
      });
      const name = useSelector(form.store, (state) => state.values.name);
      return (
        <form.AppForm>
          <RetrySubmitButton group={group} />
          <Pressable role="button" onPress={async () => group.handleSubmit({ source: 'button' })}>
            <Text>Submit override</Text>
          </Pressable>
          <ErrorProbe group={group} />
          <Text>{name}</Text>
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('not found')).toBeOnTheScreen();
    const defaultProps = {
      value: { query: 'films' },
      meta: { source: 'default' },
    };
    expect(submitted).toHaveBeenNthCalledWith(1, expect.objectContaining(defaultProps));
    expect(failed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(defaultProps));
    expect(succeeded).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Submit override' }));
    expect(await screen.findByText('found: films (button)')).toBeOnTheScreen();
    const overrideProps = {
      value: { query: 'films' },
      meta: { source: 'button' },
    };
    expect(submitted).toHaveBeenNthCalledWith(2, expect.objectContaining(overrideProps));
    expect(succeeded).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(overrideProps));
    expect(groupContexts.size).toBe(1);
    expect(screen.getByTestId('form-error')).toHaveTextContent('No form error');
  });

  it('locks a form group’s fields, and only those, while the group is submitted', async () => {
    const lookup = await Effect.runPromise(Deferred.make<string>());
    const TestForm = () => {
      const form = useAppForm({
        defaultValues: { name: '', lookup: { query: 'films' } },
        schema: LookupForm,
        onSubmit: () => Effect.void,
        onFailure: () => 'not saved',
      });
      const group = useAppFormGroup({
        form,
        name: 'lookup',
        schema: Lookup,
        onSubmit: () => Deferred.await(lookup),
        onFailure: () => 'not found',
      });
      return (
        <form.AppForm>
          <form.AppField name="name">
            {(field) => <field.TestTextField label="Name" />}
          </form.AppField>
          <form.AppField name="lookup.query">
            {(field) => <field.TestTextField label="Query" />}
          </form.AppField>
          <RetrySubmitButton group={group} />
        </form.AppForm>
      );
    };

    await render(<TestForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Query')).toBeDisabled();
    });
    expect(screen.getByLabelText('Name')).toBeEnabled();

    await act(async () => {
      await Effect.runPromise(Deferred.succeed(lookup, 'Found films'));
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Query')).toBeEnabled();
    });
  });
});
