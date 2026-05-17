/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '#src/constants/theme.ts';
import { useColorScheme } from '#src/hooks/use-color-scheme.ts';

export const useTheme = () => {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Colors[theme];
};
