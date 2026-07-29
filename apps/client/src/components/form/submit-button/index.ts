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
    | {
        ios: Omit<SwiftButtonProps, 'children'> & {
          /** Useful when using fitToContents with BottomSheet and you don't want the loading animation messing up when a form-level error appears. */
          disableAnimation?: boolean;
        };
      }
    | {
        android: Omit<ComposeButtonProps, 'children' | 'enabled'> & {
          variant?: 'default' | 'text';
        };
      };
  containerModifiers?:
    | { ios: NonNullable<HStackProps['modifiers']> }
    | { android: NonNullable<RowProps['modifiers']> };
}>;

export declare const SubmitButton: SubmitButtonComponent;
