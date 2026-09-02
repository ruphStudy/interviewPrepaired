/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Calm Mentor primary teal scale — existing primary-* utility classes
        // across the app keep working unchanged, they just render teal now.
        primary: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
        },
        // Calm Mentor surfaces/text/status — additive, namespaced so nothing
        // built-in (gray/slate/emerald/etc, still used by not-yet-migrated
        // pages) is overridden.
        mentor: {
          bg: '#F8FAF9',
          card: '#FFFFFF',
          surface: '#F3FAF8',
          mint: '#ECFDF5',
          aqua: '#ECFEFF',
          border: '#DDEBE7',
          'border-strong': '#C8DFD9',
          text: '#172A32',
          'text-secondary': '#50636A',
          'text-muted': '#829399',
          success: '#16A36A',
          warning: '#F59E0B',
          error: '#EF6461',
          info: '#38BDF8',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(25, 70, 65, 0.04), 0 1px 3px 0 rgba(25, 70, 65, 0.06)',
        card: '0 4px 18px rgba(25, 70, 65, 0.06)',
        'card-hover': '0 8px 28px rgba(25, 70, 65, 0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};
