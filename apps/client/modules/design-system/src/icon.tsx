import type { CommonViewModifierProps } from '@expo/ui/swift-ui';
import { requireNativeView } from 'expo';
import type { SFSymbolIcon } from 'expo-router/unstable-native-tabs';

export type IconProps = CommonViewModifierProps & {
  systemName: Extract<SFSymbolIcon['sf'], string>;
};

const NativeIcon: React.ComponentType<IconProps> = requireNativeView(
  'VoelDesignSystem',
  'VoelIcon'
);

export const Icon = (props: IconProps) => <NativeIcon {...props} />;
