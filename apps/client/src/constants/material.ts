import { useMaterialColors as useExpoMaterialColors } from '@expo/ui/jetpack-compose';
import type { TextFieldProps } from '@expo/ui/jetpack-compose';

import { materialFonts } from '#src/constants/material-fonts.ts';

export const materialSeedColor = '#00AAFF';

export const useMaterialColors = () => useExpoMaterialColors({ seedColor: materialSeedColor });

export const materialInputTextStyle = {
  fontFamily: materialFonts.regular.fontFamily,
  fontSize: 16,
  lineHeight: 24,
  letterSpacing: 0.5,
} satisfies NonNullable<TextFieldProps['textStyle']>;
