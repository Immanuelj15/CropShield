/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        soil: {
          50: '#fdf8f0', 100: '#f9edda', 200: '#f2d9a8',
          300: '#e8be6e', 400: '#dc9f3a', 500: '#c7831e',
          600: '#a66516', 700: '#844f13', 800: '#6b3f13', 900: '#573513',
        },
        leaf: {
          50: '#f0faf0', 100: '#dcf5dc', 200: '#b9eab9',
          300: '#86d886', 400: '#4fc24f', 500: '#2da82d',
          600: '#1f8a1f', 700: '#1a6e1a', 800: '#185718', 900: '#154815',
        },
        risk: {
          low: '#16a34a', medium: '#d97706', high: '#dc2626',
        }
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
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
