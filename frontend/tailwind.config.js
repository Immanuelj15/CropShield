/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // The app ships a single light theme. With the Tailwind 3 default ('media'), the scattered `dark:`
  // classes in a few cards/widgets flipped those components to dark on dark-mode OSes while the rest of
  // the app stayed light. 'class' keeps them inert until a real theme toggle exists.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        soil: {
          50: '#fdf8f0', 100: '#f9edda', 200: '#f2d9a8',
          300: '#e8be6e', 400: '#dc9f3a', 500: '#c7831e',
          600: '#a66516', 700: '#844f13', 800: '#6b3f13', 900: '#573513',
        },
        // Single canonical brand green — matches PWA manifest / theme-color (#0d5c2f)
        brand: {
          50: '#eefaf1', 100: '#d4f2dc', 200: '#a9e4ba',
          300: '#75cf92', 400: '#43b36c', 500: '#219350',
          600: '#0d5c2f', 700: '#0a4a26', 800: '#083c1f', 900: '#07301a',
          950: '#041d10',
        },
        risk: {
          low: '#16a34a', medium: '#d97706', high: '#dc2626',
        },
        // Role accent colors — used only for hero banners, active-nav highlight, role badge
        // (farmer = brand-600, agronomist = sky-700, admin = violet-700)
        role: {
          farmer: '#0d5c2f',
          agronomist: '#0369a1',
          admin: '#6d28d9',
        },
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      // Safety net for Tailwind-v4 names that slipped into the codebase (v3 has no shadow-xs / shadow-2xs,
      // so they silently rendered nothing). Prefer shadow-sm in new code.
      boxShadow: {
        '2xs': '0 1px 0 0 rgb(0 0 0 / 0.05)',
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        // camelCase alias: `animate-fadeIn` is used across many pages/components
        fadeIn: 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { opacity: 0, transform: 'translateY(16px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
