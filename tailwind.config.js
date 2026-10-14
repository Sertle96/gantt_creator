/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        text: token('text'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        danger: token('danger'),
        warn: token('warn'),
        ok: token('ok'),
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        pop: '0 10px 30px -10px rgb(0 0 0 / 0.35), 0 2px 6px rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
};
