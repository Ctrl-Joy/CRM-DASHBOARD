import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const v = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      boxShadow: { dashboard: 'var(--shadow-dashboard)' },
      colors: {
        border: v('border'), input: v('input'), ring: v('ring'), background: v('background'), foreground: v('foreground'),
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
        secondary: { DEFAULT: v('secondary'), foreground: v('secondary-foreground') },
        destructive: { DEFAULT: v('destructive'), foreground: v('destructive-foreground') },
        success: { DEFAULT: v('success'), foreground: v('success-foreground') },
        warning: { DEFAULT: v('warning'), foreground: v('warning-foreground') },
        muted: { DEFAULT: v('muted'), foreground: v('muted-foreground') },
        accent: { DEFAULT: v('accent'), foreground: v('accent-foreground') },
        popover: { DEFAULT: v('popover'), foreground: v('popover-foreground') },
        card: { DEFAULT: v('card'), foreground: v('card-foreground') },
        sidebar: { DEFAULT: v('sidebar'), foreground: v('sidebar-foreground'), accent: v('sidebar-accent'), border: v('sidebar-border') },
        brand: v('brand'),
        chart: { 1: v('chart-1'), 2: v('chart-2'), 3: v('chart-3'), 4: v('chart-4'), 5: v('chart-5'), 6: v('chart-6') },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .2s ease-out' },
    },
  },
  plugins: [animate],
} satisfies Config;
