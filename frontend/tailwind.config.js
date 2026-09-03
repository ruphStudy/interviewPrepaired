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
          soft: '#E6F7F4',
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
        // Futuristic Premium AI — dark-mode-only palette. Namespaced so it
        // never touches Calm Mentor's light-mode `mentor-*`/`primary-*` tokens;
        // used exclusively behind `dark:` variants.
        future: {
          bg: '#070B17',
          surface: '#0B1120',
          card: '#111827',
          elevated: '#151D2F',
          sidebar: '#080D19',
          header: '#0B1120',
          border: '#243047',
          'border-strong': '#334155',
          violet: '#8B5CF6',
          'violet-hover': '#7C3AED',
          cyan: '#22D3EE',
          'cyan-soft': '#164E63',
          pink: '#EC4899',
          text: '#F8FAFC',
          secondary: '#CBD5E1',
          muted: '#94A3B8',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#F87171',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(25, 70, 65, 0.04), 0 1px 3px 0 rgba(25, 70, 65, 0.06)',
        card: '0 4px 18px rgba(25, 70, 65, 0.06)',
        'card-hover': '0 8px 28px rgba(25, 70, 65, 0.10)',
        'future-card': '0 8px 30px rgba(0, 0, 0, 0.35)',
        'future-glow': '0 0 24px rgba(139, 92, 246, 0.18)',
        'future-glow-cyan': '0 0 20px rgba(34, 211, 238, 0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};
