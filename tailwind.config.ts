import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#072A38',
          soft: '#0F3D4E',
          muted: '#4A5B62',
        },
        sea: {
          DEFAULT: '#0E7C86',
          dark: '#0A5F67',
          light: '#3FAFB6',
        },
        foam: '#E6F2F1',
        sand: '#FBF8F3',
        sun: {
          DEFAULT: '#FF6A2B',
          dark: '#E85614',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-body)'],
      },
      borderRadius: {
        card: '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(7,42,56,0.06), 0 12px 32px -18px rgba(7,42,56,0.35)',
        lift: '0 8px 16px rgba(7,42,56,0.08), 0 32px 60px -30px rgba(7,42,56,0.45)',
      },
      maxWidth: {
        shell: '1240px',
      },
    },
  },
  plugins: [],
};

export default config;
