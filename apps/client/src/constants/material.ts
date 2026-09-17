import { useMaterialColors as useExpoMaterialColors } from '@expo/ui/jetpack-compose';
import type { TextFieldProps } from '@expo/ui/jetpack-compose';
import type { Theme } from 'expo-router/react-navigation';

export const materialSeedColor = '#00AAFF';

export const useMaterialColors = () => useExpoMaterialColors({ seedColor: materialSeedColor });

export const materialFonts = {
  regular: { fontFamily: 'Google Sans', fontWeight: '400' },
  medium: { fontFamily: 'Google Sans Medium', fontWeight: '500' },
  bold: { fontFamily: 'Google Sans SemiBold', fontWeight: '600' },
  heavy: { fontFamily: 'Google Sans Bold', fontWeight: '700' },
} as const satisfies Theme['fonts'];

export const materialInputTextStyle = {
  fontFamily: materialFonts.regular.fontFamily,
  fontSize: 16,
  lineHeight: 24,
  letterSpacing: 0.5,
} satisfies NonNullable<TextFieldProps['textStyle']>;
