const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      fontFamily: {
        'voel-inter-bold': ['Voel-Inter-Bold'],
        'voel-inter-thin': ['Voel-Inter-Thin'],
        'voel-inter-black': ['Voel-Inter-Black'],
        'voel-inter-light': ['Voel-Inter-Light'],
        'voel-inter-italic': ['Voel-Inter-Italic'],
        'voel-inter-medium': ['Voel-Inter-Medium'],
        'voel-inter-regular': ['Voel-Inter-Regular'],
        'voel-inter-semibold': ['Voel-Inter-SemiBold'],
        'voel-inter-extrabold': ['Voel-Inter-ExtraBold'],
        'voel-inter-bolditalic': ['Voel-Inter-BoldItalic'],
        'voel-inter-extralight': ['Voel-Inter-ExtraLight'],
        'voel-inter-thinitalic': ['Voel-Inter-ThinItalic'],
        'voel-inter-blackitalic': ['Voel-Inter-BlackItalic'],
        'voel-inter-lightitalic': ['Voel-Inter-LightItalic'],
        'voel-inter-mediumitalic': ['Voel-Inter-MediumItalic'],
        'voel-inter-semibolditalic': ['Voel-Inter-SemiBoldItalic'],
        'voel-inter-extrabolditalic': ['Voel-Inter-ExtraBoldItalic'],
        'voel-inter-extralightitalic': ['Voel-Inter-ExtraLightItalic'],
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require('tailwindcss-animate')],
};
