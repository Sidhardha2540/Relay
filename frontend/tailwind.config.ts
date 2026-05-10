import type { Config } from 'tailwindcss';

/**
 * Coord palette — subtle, bright light theme.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class', // We can keep the class but default to light
  theme: {
    extend: {
      colors: {
        bg:       'var(--bg)',
        surface:  'var(--surface)',
        border:   'var(--border)',
        border2:  'var(--border2)',
        muted:    'var(--muted)',
        subtle:   'var(--subtle)',
        text:     'var(--text)',

        // Agent identity (softer/pastel tones)
        claude:   '#6366F1', // Indigo
        cursor:   '#14B8A6', // Teal
        aider:    '#059669', // Emerald
        human:    '#F43F5E', // Rose
        antigravity: '#06B6D4', // Cyan

        // Event semantics
        decision:  '#6366F1',  // indigo
        discovery: '#10B981',  // emerald
        intent:    '#F59E0B',  // amber
        question:  '#F43F5E',  // rose
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'sm': '0 2px 4px rgba(70, 60, 50, .04), 0 1px 2px rgba(70, 60, 50, .02)',
        'md': '0 8px 16px rgba(70, 60, 50, .06), 0 4px 8px rgba(70, 60, 50, .04)',
        'lg': '0 16px 32px rgba(70, 60, 50, .08), 0 8px 16px rgba(70, 60, 50, .05)',
      },
      keyframes: {
        slideIn: {
          '0%':   { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        slideIn: 'slideIn 220ms ease-out',
        fadeIn: 'fadeIn 300ms ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
