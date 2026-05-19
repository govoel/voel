import { createModifier } from '@expo/ui/swift-ui/modifiers';
import type { ModifierConfig } from '@expo/ui/swift-ui/modifiers';
import { requireNativeModule } from 'expo';

import type { IOSTextStyle } from './VoelDesignSystem.types';

requireNativeModule('VoelDesignSystem');

export const iosTextStyle = (style: IOSTextStyle): ModifierConfig =>
  createModifier('voelTextStyle', { style });
