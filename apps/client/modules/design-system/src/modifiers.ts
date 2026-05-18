import { createModifier, type ModifierConfig } from '@expo/ui/swift-ui/modifiers';
import { requireNativeModule } from 'expo';

import type { IOSTextStyle } from './VoelDesignSystem.types';

export const VoelDesignSystem = requireNativeModule('VoelDesignSystem');

export function iosTextStyle(style: IOSTextStyle): ModifierConfig {
  return createModifier('voelTextStyle', { style });
}
