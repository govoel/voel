/* eslint-disable @typescript-eslint/no-deprecated */
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { act, createElement } from 'react';
import type { ComponentType } from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import {
  FormSubmitError,
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
  useFormSubmitError,
} from '#src/components/form/hooks.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const EmptyComponent = (() => null) satisfies ComponentType;

const runtime = ManagedRuntime.make(Layer.empty);
const schema = Schema.Struct({ name: Schema.String });

const { useAppForm } = createEffectSchemaFormHook({
  fieldComponents: { EmptyComponent },
  fieldContext,
  formComponents: { EmptyComponent },
  formContext,
});

interface Deferred<A> {
  readonly promise: Promise<A>;
  readonly resolve: (value: A) => void;
}

interface TestFormControls {
  readonly handleSubmit: () => Promise<void>;
  readonly reset: () => void;
}

interface RendererControls {
  readonly unmount: () => void;
}

const makeDeferred = <A>(): Deferred<A> => {
  const { promise, resolve } = Promise.withResolvers<A>();
  return { promise, resolve };
};

const submitFailureAfter = (deferred: Deferred<null>, message: string) =>
  Effect.promise(async () => deferred.promise).pipe(
    Effect.flatMap(() => Effect.fail(new FormSubmitError({ message })))
  );

const ErrorProbe = ({ onError }: { readonly onError: (message: string | null) => void }) => {
  onError(useFormSubmitError()?.message ?? null);
  return null;
};

describe('createEffectSchemaFormHook', () => {
  it('does not restore a stale submit error after reset', async () => {
    const deferred = makeDeferred<null>();
    const errors: (string | null)[] = [];
    let form: TestFormControls | null = null;
    let renderer: RendererControls | null = null;
    let submitStarted = false;
    let submit = Promise.resolve();

    const getForm = () => {
      if (form === null) {
        throw new Error('Form was not rendered');
      }

      return form;
    };

    const getRenderer = () => {
      if (renderer === null) {
        throw new Error('Renderer was not created');
      }

      return renderer;
    };

    const TestForm = () => {
      const nextForm = useAppForm({
        defaultValues: { name: 'ok' },
        runtime,
        schema,
        onSubmit: () => {
          submitStarted = true;
          return submitFailureAfter(deferred, 'stale submit error');
        },
      });

      form = nextForm;

      return createElement(
        nextForm.AppForm,
        null,
        createElement(ErrorProbe, {
          onError: (error) => {
            errors.push(error);
          },
        })
      );
    };

    await act(async () => {
      renderer = create(createElement(TestForm));
    });

    await act(async () => {
      submit = getForm().handleSubmit();
      await vi.waitFor(() => {
        expect(submitStarted).toBe(true);
      });
    });

    await act(async () => {
      getForm().reset();
    });

    await act(async () => {
      deferred.resolve(null);
      await submit;
    });

    expect(errors).not.toContain('stale submit error');
    expect(errors.at(-1)).toBeNull();

    await act(async () => {
      getRenderer().unmount();
    });
  });

  it('keeps the newer submit error when an older reset submit resolves later', async () => {
    const oldResult = { deferred: makeDeferred<null>(), message: 'old submit error' };
    const newResult = { deferred: makeDeferred<null>(), message: 'new submit error' };
    const submitResults = [oldResult, newResult] as const;
    const errors: (string | null)[] = [];
    let form: TestFormControls | null = null;
    let renderer: RendererControls | null = null;
    let oldSubmit = Promise.resolve();
    let newSubmit = Promise.resolve();
    let submitIndex = 0;

    const getForm = () => {
      if (form === null) {
        throw new Error('Form was not rendered');
      }

      return form;
    };

    const getRenderer = () => {
      if (renderer === null) {
        throw new Error('Renderer was not created');
      }

      return renderer;
    };

    const TestForm = () => {
      const nextForm = useAppForm({
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

      form = nextForm;

      return createElement(
        nextForm.AppForm,
        null,
        createElement(ErrorProbe, {
          onError: (error) => {
            errors.push(error);
          },
        })
      );
    };

    await act(async () => {
      renderer = create(createElement(TestForm));
    });

    await act(async () => {
      oldSubmit = getForm().handleSubmit();
      await vi.waitFor(() => {
        expect(submitIndex).toBe(1);
      });
    });

    await act(async () => {
      getForm().reset();
    });

    await act(async () => {
      newSubmit = getForm().handleSubmit();
      await vi.waitFor(() => {
        expect(submitIndex).toBe(2);
      });
    });

    await act(async () => {
      newResult.deferred.resolve(null);
      await newSubmit;
    });

    expect(errors.at(-1)).toBe('new submit error');

    await act(async () => {
      oldResult.deferred.resolve(null);
      await oldSubmit;
    });

    expect(errors.at(-1)).toBe('new submit error');
    expect(errors).not.toContain('old submit error');

    await act(async () => {
      getRenderer().unmount();
    });
  });
});
