import type { Config } from 'tailwindcss';

/**
 * Coord palette — dark mode default. The four event types each get a
 * semantic color that the panels reference by name.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:       '#0A0A0A',
        surface:  '#141414',
        border:   '#262626',
        muted:    '#737373',
        text:     '#E5E5E5',

        // Agent identity
        claude:   '#C77B5C',
        cursor:   '#6E56CF',
        aider:    '#10B981',
        human:    '#F5F5F5',

        // Event semantics
        decision:  '#10B981',  // green — committed contract
        discovery: '#3B82F6',  // blue — fact
        intent:    '#F59E0B',  // amber — work in progress
        question:  '#EF4444',  // red — blocker
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      keyframes: {
        slideIn: {
          '0%':   { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        pulseRed: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.5)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(239,68,68,0)' },
        },
      },
      animation: {
        slideIn: 'slideIn 220ms ease-out',
        pulseRed: 'pulseRed 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
