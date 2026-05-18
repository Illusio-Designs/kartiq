/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Fonts are loaded at boot via expo-font in app/_layout.tsx; the
      // strings here must match the family keys passed to useFonts.
      // `font-sans` (the default body font) resolves to Poppins, while
      // `font-agency` / `font-display` opt into the Agency display font.
      fontFamily: {
        sans:    ['Poppins'],
        poppins: ['Poppins'],
        agency:  ['Agency'],
        display: ['Agency'],
      },
      colors: {
        // Brand override — every existing `emerald-*` class in the mobile app
        // now renders in the Kartriq teal/cyan palette without touching
        // component code (mirrors frontend tailwind.config.ts).
        emerald: {
          50:  '#F0FCF8',
          100: '#D8F8EC',
          200: '#A8F0DA',
          300: '#6CE5C7',
          400: '#2BD5B6',
          500: '#06D4B8', // brand teal
          600: '#04AB94', // brand teal — hover/dark
          700: '#077F70',
          800: '#0A5A50',
          900: '#0B3D38',
        },
        brand: {
          DEFAULT: '#06D4B8',
          light:   '#2BD5B6',
          dark:    '#04AB94',
          foreground: '#ffffff',
          50:  '#F0FCF8',
          100: '#D8F8EC',
          500: '#06D4B8',
          600: '#04AB94',
          700: '#077F70',
        },
        cyan: {
          50:  '#ECFEFF',
          100: '#CFFAFE',
          400: '#22D3EE',
          500: '#06B6D4', // brand cyan
          600: '#0891B2',
          700: '#0E7490',
        },
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8fafc',
          tertiary: '#f1f5f9',
        },
        navy: {
          DEFAULT: '#0f172a',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
    },
  },
  plugins: [],
};
