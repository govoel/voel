import type { CommonViewModifierProps } from '@expo/ui/swift-ui';
import { requireNativeView } from 'expo';

type ViewEvent<Name extends string, Data> = Record<
  Name,
  Data extends object
    ? ((event: { nativeEvent: Data }) => void) | undefined
    : (() => void) | undefined
>;

type GlobalEventPayload = Record<string, Record<string, unknown>>;
type ModifierWithEventListener = NonNullable<CommonViewModifierProps['modifiers']>[number] & {
  eventListener?: (params: unknown) => void;
};

export type DisclosureButtonProps = CommonViewModifierProps & {
  onPress?: () => void;
  children?: React.ReactNode;
};

type NativeDisclosureButtonProps = Omit<DisclosureButtonProps, 'onPress'> &
  ViewEvent<'onDisclosureButtonPress', void> & {
    onGlobalEvent?: (event: { nativeEvent: GlobalEventPayload }) => void;
  };

const NativeDisclosureButton: React.ComponentType<NativeDisclosureButtonProps> = requireNativeView(
  'VoelDesignSystem',
  'VoelDisclosureButton'
);

const createViewModifierEventListener = (modifiers: ModifierWithEventListener[]) => {
  const eventListeners = new Map<string, (params: unknown) => void>();

  for (const modifier of modifiers) {
    if (modifier.eventListener) {
      eventListeners.set(modifier.$type, modifier.eventListener);
    }
  }

  return {
    onGlobalEvent: ({ nativeEvent }: { nativeEvent: GlobalEventPayload }) => {
      for (const [eventName, params] of Object.entries(nativeEvent)) {
        eventListeners.get(eventName)?.(params);
      }
    },
  };
};

export const DisclosureButton = ({ modifiers, onPress, ...restProps }: DisclosureButtonProps) => {
  const modifierProps = modifiers
    ? {
        modifiers,
        ...createViewModifierEventListener(modifiers as ModifierWithEventListener[]),
      }
    : {};

  return (
    <NativeDisclosureButton onDisclosureButtonPress={onPress} {...modifierProps} {...restProps} />
  );
};
