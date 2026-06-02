/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Flat keys — avoid nesting under `editor.bg` (conflicts with bg-* utilities)
        'editor-bg': '#08080b',
        'editor-surface': '#0f0f14',
        'editor-panel': '#13131a',
        'editor-elevated': '#1a1a24',
        'editor-border': '#252532',
        'editor-border-subtle': '#1c1c26',
        'editor-muted': '#6b6b80',
        'editor-text': '#e8e8f0',
        'editor-dim': '#9898ad',
        accent: {
          DEFAULT: '#a78bfa',
          bright: '#c4b5fd',
          glow: 'rgba(167, 139, 250, 0.35)',
          warm: '#fb923c',
        },
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 48px -12px rgba(0,0,0,0.6)',
        glow: '0 0 40px -8px rgba(167, 139, 250, 0.25)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
};
