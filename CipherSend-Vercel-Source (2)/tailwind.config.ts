import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#071014',
        panel: '#0c191e',
        mint: '#82f0d0',
        cyan: '#5dd9eb',
        muted: '#91a5aa'
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica Neue', 'sans-serif'],
        mono: ['SFMono-Regular', 'Consolas', 'monospace']
      },
      boxShadow: {
        glow: '0 0 36px rgba(93, 217, 235, 0.12)'
      }
    }
  },
  plugins: []
};

export default config;
