/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#6366f1',
          muted: 'rgba(99, 102, 241, 0.12)',
        },
      },
      fontSize: {
        'display': ['2.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'heading': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
      },
    },
  },
  plugins: [],
}
