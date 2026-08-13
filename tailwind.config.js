/** @type {import('tailwindcss').Config} */
// Tailwind config wired to the SSH / AppTheme CSS variables (src/theme/tokens.css).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary navy palette (AppTheme.primary / primaryLight / accent)
        primary: {
          DEFAULT: 'var(--color-primary)',
          light: 'var(--color-primary-light)',
          dark: 'var(--color-primary-dark)',
        },
        accent:    'var(--color-accent)',
        highlight: 'var(--color-highlight)',

        // Surfaces
        surface:      'var(--color-surface)',
        'surface-card': 'var(--color-surface-card)',
        'surface-dark': 'var(--color-surface-dark)',

        // Borders
        border:        'var(--color-border)',
        'border-light': 'var(--color-border-light)',

        // Status colours
        success:       'var(--color-success)',
        'success-bg':  'var(--color-success-bg)',
        'success-light': 'var(--color-success-light)',

        warning:       'var(--color-warning)',
        'warning-bg':  'var(--color-warning-bg)',
        'warning-light': 'var(--color-warning-light)',

        danger:        'var(--color-danger)',
        'danger-bg':   'var(--color-danger-bg)',
        'danger-light': 'var(--color-danger-light)',

        info:          'var(--color-info)',
        'info-bg':     'var(--color-info-bg)',
        'info-light':  'var(--color-info-light)',

        // Text
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted':     'var(--color-text-muted)',
        'text-hint':      'var(--color-text-hint)',
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:  'var(--shadow-card)',
        pop:   'var(--shadow-pop)',
        glass: 'var(--shadow-glass)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
    },
  },
  plugins: [],
};
