import type { Theme } from 'expo-router';

// Compose resolves custom families at normal weight, so each weight needs its own alias.
export const materialFonts = {
  regular: { fontFamily: 'Google Sans', fontWeight: '400' },
  medium: { fontFamily: 'Google Sans Medium', fontWeight: '500' },
  bold: { fontFamily: 'Google Sans SemiBold', fontWeight: '600' },
  heavy: { fontFamily: 'Google Sans Bold', fontWeight: '700' },
} as const satisfies Theme['fonts'];
