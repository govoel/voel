import type { ButtonProps as ComposeButtonProps, RowProps } from '@expo/ui/jetpack-compose';
import type { HStackProps, ButtonProps as SwiftButtonProps } from '@expo/ui/swift-ui';
import type { ComponentType, ReactElement } from 'react';

interface SubmitErrorState {
  readonly canSubmit: boolean;
  readonly errorMap: {
    readonly onSubmit?: unknown;
  };
  readonly fieldMeta: Readonly<
    Record<
      string,
      | {
          readonly errorMap: {
            readonly onSubmit?: unknown;
          };
        }
      | undefined
    >
  >;
}

// TanStack includes onSubmit errors in canSubmit. Those errors represent a completed
// mutation attempt here, so they must not prevent the user from retrying the mutation.
export const canSubmitOrRetry = ({ canSubmit, errorMap, fieldMeta }: SubmitErrorState) =>
  canSubmit ||
  errorMap.onSubmit !== void 0 ||
  Object.values(fieldMeta).some((meta) => meta?.errorMap.onSubmit !== void 0);

export type SubmitButtonComponent = ComponentType<{
  children: ReactElement | ReactElement[];
  disabled?: boolean;
  platformProps?:
    | { ios: Omit<SwiftButtonProps, 'children'> }
    | { android: Omit<ComposeButtonProps, 'children' | 'enabled'> };
  containerModifiers?:
    | { ios: NonNullable<HStackProps['modifiers']> }
    | { android: NonNullable<RowProps['modifiers']> };
}>;

export declare const SubmitButton: SubmitButtonComponent;
